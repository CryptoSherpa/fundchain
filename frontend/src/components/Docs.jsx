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
          <h2>Connect Your Wallet to Your Agent</h2>
          <p>
            AI agents need a funded EVM wallet to create campaigns and donate. The agent
            signs transactions with its <strong>private key</strong>, so you'll set up a
            dedicated wallet, fund it, and pass the key to the SDK or MCP server via an
            environment variable.
          </p>

          <p className={styles.warning}>
            <strong>Security first:</strong> create a <strong>dedicated agent wallet</strong> —
            never use your main wallet. The agent will sign transactions autonomously, so
            anything in that wallet is fair game for the agent (and anyone who compromises
            the key). Keep the balance small.
          </p>

          <h3 className={styles.subhead}>1. Create a dedicated wallet in MetaMask</h3>
          <ol className={styles.steps}>
            <li>Open MetaMask → click your account icon (top right) → <strong>Add account or hardware wallet</strong> → <strong>Add a new Ethereum account</strong>.</li>
            <li>Name it something obvious like <code>fundchain-agent</code> so you don't confuse it with your main wallet.</li>
            <li>Copy the new account's <strong>public address</strong> — you'll send funds here.</li>
          </ol>

          <h3 className={styles.subhead}>2. Export the private key</h3>
          <ol className={styles.steps}>
            <li>With the agent account selected, click the ⋮ menu → <strong>Account details</strong> → <strong>Show private key</strong>.</li>
            <li>Enter your MetaMask password and reveal the key. It will look like <code>0xabc123…</code> (64 hex chars after the <code>0x</code>).</li>
            <li>Copy it once — you'll paste it straight into an environment variable in the next step. Do <strong>not</strong> save it in a file or paste it into chat.</li>
          </ol>

          <h3 className={styles.subhead}>3. Fund the wallet</h3>
          <ol className={styles.steps}>
            <li>Send a small amount of <strong>ETH</strong> to cover gas + x402 fees (0.0001 ETH per write). Start with ~0.01 ETH — enough for ~100 calls.</li>
            <li>If you plan to donate in <strong>USDC</strong>, send some USDC too (the agent still pays gas in ETH).</li>
            <li>On testnets, grab ETH from a faucet (e.g. <a href="https://sepoliafaucet.com" target="_blank" rel="noreferrer">Sepolia faucet</a>) and USDC from <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle's testnet faucet</a>.</li>
          </ol>

          <h3 className={styles.subhead}>4. Wire the key into your agent</h3>
          <p>Set the key as an environment variable — never hardcode it.</p>

          <p><strong>Shell (macOS / Linux):</strong></p>
          <pre className={styles.code}>
{`# In your shell profile (~/.zshrc, ~/.bashrc) or a .env file
export AGENT_WALLET_KEY="0xabc123...your-agent-wallet-private-key"`}
          </pre>

          <p><strong>Python SDK:</strong></p>
          <pre className={styles.code}>
{`import os
from fundchain import FundchainAgent

agent = FundchainAgent(
    wallet_key=os.environ["AGENT_WALLET_KEY"],  # Never hardcode!
)

# Now the agent can browse, create, and donate.
agent.donate(campaign_id=0, amount_eth="0.01")`}
          </pre>

          <p><strong>MCP server (Claude Desktop config):</strong></p>
          <pre className={styles.code}>
{`{
  "mcpServers": {
    "fundchain": {
      "command": "node",
      "args": ["/path/to/mcp/src/index.js"],
      "env": {
        "AGENT_WALLET_KEY": "0x...",
        "FUNDCHAIN_API_URL": "https://fundchain.up.railway.app"
      }
    }
  }
}`}
          </pre>
          <p className={styles.note}>
            Claude Desktop reads <code>claude_desktop_config.json</code> on startup and
            injects the <code>env</code> block into the MCP server's process — the key
            never appears in chat. Restart Claude Desktop after editing the file.
          </p>

          <h3 className={styles.subhead}>Security best practices</h3>
          <ul>
            <li><strong>Dedicated wallet only</strong> — never reuse your main wallet. Treat the agent wallet like a hot wallet for a single app.</li>
            <li><strong>Environment variables only</strong> — never commit the key to git, paste it into a prompt, or hardcode it in source. Add <code>.env</code> to <code>.gitignore</code>.</li>
            <li><strong>Keep the balance small</strong> — top up as the agent works. A drained wallet limits the blast radius of a compromised key.</li>
            <li><strong>Monitor on Etherscan</strong> — bookmark the agent address on <a href="https://etherscan.io" target="_blank" rel="noreferrer">Etherscan</a> (or the appropriate L2 explorer) to watch activity.</li>
            <li><strong>Rotate immediately if compromised</strong> — generate a new wallet, move funds, swap the env var. The old key is permanently burned.</li>
            <li><strong>Set spend caps in your prompts</strong> — tell the agent its budget ("donate at most 0.05 ETH total"); models will respect explicit limits.</li>
          </ul>
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
{`import os
from fundchain import FundchainAgent

agent = FundchainAgent(wallet_key=os.environ["AGENT_WALLET_KEY"])

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
