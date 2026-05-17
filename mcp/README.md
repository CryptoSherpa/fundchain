# FundChain MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude (and any MCP-aware AI agent) browse, create, and fund crowdfunding campaigns on FundChain. The server wraps the FundChain REST gateway and handles the [x402](https://www.x402.org) payment handshake transparently — the model just calls tools, the server handles the 402 → retry.

## Tools

| Tool | Description | Cost |
| --- | --- | --- |
| `list_campaigns()` | All campaigns with metadata | Free |
| `get_campaign(campaign_id)` | One campaign by id | Free |
| `create_campaign(title, description, goal, currency, duration_days, category, image_url?)` | Creates a campaign on-chain | 0.0001 ETH (x402) |
| `donate_to_campaign(campaign_id, amount, currency?)` | Donates to a campaign on-chain | donation + 0.0001 ETH (x402) |

## Install

```bash
npm install -g @fundchain/mcp
```

Or run directly without installing:

```bash
npx -y @fundchain/mcp
```

## Claude Desktop — one-click install

Open `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows) and add:

```json
{
  "mcpServers": {
    "fundchain": {
      "command": "npx",
      "args": ["-y", "@fundchain/mcp"]
    }
  }
}
```

Restart Claude Desktop. You'll see a 🔌 indicator showing four new FundChain tools.

To point at a different backend (local Hardhat, staging):

```json
{
  "mcpServers": {
    "fundchain": {
      "command": "npx",
      "args": ["-y", "@fundchain/mcp"],
      "env": { "FUNDCHAIN_API_URL": "http://localhost:3001" }
    }
  }
}
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `FUNDCHAIN_API_URL` | `https://fundchain.up.railway.app` | FundChain REST gateway base URL |

## Run from source

```bash
cd mcp
npm install
node src/index.js
```

The server speaks MCP over stdio — pair it with `mcp-inspector` or any MCP client to drive it manually.
