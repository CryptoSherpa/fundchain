#!/usr/bin/env node
// FundChain MCP server.
//
// Exposes the FundChain REST API (https://fundchain.up.railway.app by default)
// as MCP tools so Claude and other MCP-aware agents can browse, create, and
// fund campaigns. Paid endpoints (/api/create, /api/donate) are guarded by
// x402: this server handles the 402 → X-PAYMENT retry transparently so the
// LLM never sees the protocol mechanics.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = (process.env.FUNDCHAIN_API_URL || "https://fundchain.up.railway.app").replace(/\/+$/, "");
const X402_HEADER = "X-PAYMENT";
const X402_REQUIREMENTS_HEADER = "X-Payment-Required";

// Build the X-PAYMENT header value: base64(JSON). In demo mode the backend
// accepts any decodable payload; in production this is where you'd plug in
// a real on-chain transaction signed by FUNDCHAIN_WALLET_KEY.
function encodePaymentHeader(payload) {
  return Buffer.from(JSON.stringify({ ts: Date.now(), ...payload }), "utf8").toString("base64");
}

// fetch wrapper that follows x402: on a 402, read X-Payment-Required, mint
// a payload, and retry. Throws on non-2xx after retry.
async function x402Fetch(path, { method = "GET", body } = {}) {
  const url = `${API_URL}${path}`;
  const init = {
    method,
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  let res = await fetch(url, init);

  if (res.status === 402) {
    const reqHeader = res.headers.get(X402_REQUIREMENTS_HEADER);
    let requirements;
    if (reqHeader) {
      try { requirements = JSON.parse(reqHeader); } catch { /* fall through to body */ }
    }
    if (!requirements) {
      const json = await res.json().catch(() => ({}));
      requirements = json.requirements || {};
    }
    const payload = encodePaymentHeader({
      note: "fundchain-mcp",
      route: requirements.route || `${method} ${path}`,
    });
    res = await fetch(url, { ...init, headers: { ...init.headers, [X402_HEADER]: payload } });
  }

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const detail = json.error || json.raw || `HTTP ${res.status}`;
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`);
  }
  return json;
}

// ── Tool definitions ────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "list_campaigns",
    description:
      "List all FundChain crowdfunding campaigns. Returns an array of campaigns with id, title, description, " +
      "creator, category, goal, amountRaised, deadline (unix), donorCount, currency (ETH or USDC), and status flags. " +
      "Free — no payment required.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_campaign",
    description:
      "Fetch a single FundChain campaign by its numeric id. Free — no payment required.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", minimum: 0, description: "Numeric campaign id (starts at 0)." },
      },
      required: ["campaign_id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_campaign",
    description:
      "Create a new crowdfunding campaign on-chain via the FundChain backend. Costs 0.0001 ETH " +
      "via x402 — this server handles the payment handshake automatically. Returns the new campaign id and tx hash.",
    inputSchema: {
      type: "object",
      properties: {
        title:         { type: "string", minLength: 1, maxLength: 100 },
        description:   { type: "string", minLength: 1, maxLength: 1000 },
        goal:          { type: "string", description: "Funding goal as a decimal string in the campaign's currency (e.g. \"1.5\" for 1.5 ETH or 5000 USDC)." },
        currency:      { type: "string", enum: ["ETH", "USDC"], description: "Currency the campaign accepts." },
        duration_days: { type: "integer", minimum: 1, maximum: 365, description: "Days until the campaign deadline." },
        category:      { type: "string", minLength: 1, maxLength: 50 },
        image_url:     { type: "string", description: "Optional image URL.", default: "" },
      },
      required: ["title", "description", "goal", "currency", "duration_days", "category"],
      additionalProperties: false,
    },
  },
  {
    name: "donate_to_campaign",
    description:
      "Donate to a FundChain campaign. The donation amount is paid to the campaign's escrow on-chain. " +
      "Costs an additional 0.0001 ETH x402 gateway fee — this server handles the payment handshake automatically. " +
      "Returns the on-chain tx hash.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "integer", minimum: 0 },
        amount:      { type: "string", description: "Decimal amount in the campaign's currency, e.g. \"0.05\"." },
        currency:    { type: "string", enum: ["ETH", "USDC"], description: "Informational — the campaign's currency is authoritative server-side." },
      },
      required: ["campaign_id", "amount"],
      additionalProperties: false,
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────────────
async function callTool(name, args) {
  switch (name) {
    case "list_campaigns": {
      const data = await x402Fetch("/api/campaigns");
      return data;
    }
    case "get_campaign": {
      const id = args.campaign_id;
      const data = await x402Fetch(`/api/campaigns/${id}`);
      return data;
    }
    case "create_campaign": {
      const data = await x402Fetch("/api/create", {
        method: "POST",
        body: {
          title: args.title,
          description: args.description,
          category: args.category,
          imageUrl: args.image_url || "",
          goalAmount: args.goal,
          durationDays: args.duration_days,
          currency: args.currency,
        },
      });
      return data;
    }
    case "donate_to_campaign": {
      const data = await x402Fetch("/api/donate", {
        method: "POST",
        body: { campaignId: args.campaign_id, amount: args.amount },
      });
      return data;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP server wiring ───────────────────────────────────────────────────────
const server = new Server(
  { name: "fundchain", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    const result = await callTool(name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: "text", text: e.message || String(e) }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`fundchain-mcp ready (API_URL=${API_URL})`);
