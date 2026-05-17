import { API_BASE, X402_HEADER, X402_REQUIREMENTS_HEADER } from "../x402";
// Reuses the existing ApiDocs stylesheet — both pages share the same
// docs-page chrome (topbar, sections, code blocks, callouts).
import styles from "./ApiDocs.module.css";

export default function Docs() {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <a href="/" className={styles.back}>← Back to FundChain</a>
        <span className={styles.badge}>Developers</span>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>FundChain Developer Docs</h1>
        <p className={styles.lede}>
          FundChain is a decentralized crowdfunding contract with an{" "}
          <strong>HTTP-native, AI-agent-friendly</strong> surface. There are three ways to
          integrate: <strong>REST + x402</strong>, a <strong>Model Context Protocol server</strong> (for Claude
          Desktop and other MCP clients), and a <strong>Python SDK</strong>. Pick the one that
          matches your stack.
        </p>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2>Quick Start — 5 minutes to your first campaign</h2>
          <p className={styles.callout}>
            <strong>Fastest path:</strong> install the MCP server in Claude Desktop and ask Claude to
            create a campaign. No code, no wallet UI — Claude calls the tools for you.
          </p>

          <p>1. Add to <code className={styles.inline}>claude_desktop_config.json</code>:</p>
          <pre className={styles.code}>
{`{
  "mcpServers": {
    "fundchain": {
      "command": "npx",
      "args": ["-y", "@fundchain/mcp"]
    }
  }
}`}
          </pre>

          <p>2. Restart Claude Desktop. You should see four new tools available.</p>

          <p>3. Ask Claude:</p>
          <pre className={styles.code}>
{`Create a FundChain campaign titled "Trail repairs at Mt. Tam"
with a 1.5 ETH goal, 30-day deadline, in the Environment category.`}
          </pre>

          <p className={styles.note}>
            Prefer code? Skip ahead to the <strong>Python SDK</strong> or <strong>curl</strong> sections below.
            For deep on-chain integrations (skip the gateway entirely), see the contract ABI
            in <code>frontend/src/abi.js</code> and use ethers.js / viem / web3.py directly.
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2>API Reference</h2>
          <p>
            Base URL: <code className={styles.inline}>{API_BASE}</code>. Reads are free; writes
            cost 0.0001 ETH per call via x402.
          </p>
          <table className={styles.table}>
            <thead>
              <tr><th>Method</th><th>Path</th><th>Price</th><th>Body / Notes</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>GET</td><td><code>/health</code></td><td>Free</td>
                <td>Liveness check, returns x402 mode + signer address</td>
              </tr>
              <tr>
                <td>GET</td><td><code>/api/docs</code></td><td>Free</td>
                <td>Machine-readable schema of all endpoints</td>
              </tr>
              <tr>
                <td>GET</td><td><code>/api/campaigns</code></td><td>Free</td>
                <td>All campaigns: <code>{"{ count, campaigns: [...] }"}</code></td>
              </tr>
              <tr>
                <td>GET</td><td><code>/api/campaigns/:id</code></td><td>Free</td>
                <td>Single campaign by numeric id</td>
              </tr>
              <tr>
                <td>POST</td><td><code>/api/create</code></td><td>0.0001 ETH</td>
                <td><code>{"{ title, description, category, imageUrl?, goalAmount, durationDays, currency: \"ETH\"|\"USDC\" }"}</code></td>
              </tr>
              <tr>
                <td>POST</td><td><code>/api/donate</code></td><td>0.0001 ETH</td>
                <td><code>{"{ campaignId, amount }"}</code> — amount in the campaign's currency</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2>x402 Payment Flow</h2>
          <p>
            x402 is an HTTP-native micropayment protocol. The flow:
          </p>
          <ol className={styles.numbered}>
            <li>Client sends a normal request to a paid endpoint with no payment header.</li>
            <li>Server responds <strong>HTTP 402</strong> with an{" "}
              <code>{X402_REQUIREMENTS_HEADER}</code> response header containing JSON
              requirements (<code>{`{ scheme, network, asset, amount, payTo, route }`}</code>).</li>
            <li>Client constructs a payment payload — in production, a signed on-chain
              tx reference the facilitator can verify; in demo mode, any JSON.</li>
            <li>Client base64-encodes the payload and retries with{" "}
              <code>{X402_HEADER}: &lt;base64&gt;</code>. Server serves the route.</li>
          </ol>
          <p className={styles.note}>
            The MCP server and Python SDK handle this retry transparently — you only ever
            see steps 1 and 4. If you're rolling your own HTTP client, see the curl example
            below.
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2>Python SDK</h2>
          <p>Install:</p>
          <pre className={styles.code}>{`pip install fundchain`}</pre>

          <p>Browse and donate:</p>
          <pre className={styles.code}>
{`from fundchain import FundchainAgent

agent = FundchainAgent(wallet_key="0xYOURPRIVATEKEY")

# Free
listing = agent.list_campaigns()
print(f"{listing['count']} active campaigns")

# x402-paid — SDK handles the 402 → retry handshake.
result = agent.create_campaign(
    title="Solar panels for the village school",
    description="Funding a 10 kW solar array.",
    goal_eth="2.5",
    duration_days=30,
    category="Community",
    currency="ETH",
)
print("campaign", result["campaignId"], "tx", result["txHash"])

agent.donate(campaign_id=result["campaignId"], amount_eth="0.05")`}
          </pre>
          <p className={styles.footnote}>
            Zero runtime dependencies — uses stdlib <code>urllib</code> so it installs cleanly
            anywhere Python ≥ 3.9 runs. Full API in the <code>FundchainAgent</code> docstring.
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2>JavaScript / MCP</h2>
          <p>For Claude Desktop and other MCP-aware agents, install the MCP server:</p>
          <pre className={styles.code}>{`npm install -g @fundchain/mcp`}</pre>

          <p>Or wire it directly into Claude Desktop config (see Quick Start above).</p>

          <p>For browser / Node.js code, the frontend ships an x402 fetch helper:</p>
          <pre className={styles.code}>
{`import { x402Fetch } from "./x402";

// Handles 402 → retry transparently.
const res = await x402Fetch("/api/donate", {
  method: "POST",
  body: { campaignId: 0, amount: "0.01" },
});
const { txHash } = await res.json();
console.log("donated:", txHash);`}
          </pre>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2>curl</h2>
          <p>Browse (free):</p>
          <pre className={styles.code}>{`curl ${API_BASE}/api/campaigns | jq`}</pre>

          <p>Donate with full x402 round-trip:</p>
          <pre className={styles.code}>
{`# 1) First call gets HTTP 402 + payment requirements
curl -i -X POST ${API_BASE}/api/donate \\
  -H "Content-Type: application/json" \\
  -d '{"campaignId": 0, "amount": "0.01"}'

# 2) Construct a payment payload and base64-encode it
PAYLOAD=$(printf '%s' '{"note":"demo","route":"POST /api/donate"}' | base64)

# 3) Retry with the X-PAYMENT header
curl -X POST ${API_BASE}/api/donate \\
  -H "Content-Type: application/json" \\
  -H "${X402_HEADER}: $PAYLOAD" \\
  -d '{"campaignId": 0, "amount": "0.01"}'`}
          </pre>
          <p className={styles.note}>
            In demo mode any decodable payload is accepted. Production deployments delegate
            to an <a href="https://www.x402.org" target="_blank" rel="noreferrer">x402 facilitator</a> for real settlement.
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2>Going deeper</h2>
          <ul>
            <li><a href="/api-docs">API reference (machine-readable)</a></li>
            <li><a href="https://www.x402.org" target="_blank" rel="noreferrer">x402 protocol spec</a></li>
            <li><a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">Model Context Protocol docs</a></li>
            <li><a href="https://github.com/CryptoSherpa/fundchain" target="_blank" rel="noreferrer">FundChain source on GitHub</a></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
