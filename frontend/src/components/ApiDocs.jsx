import { API_BASE, API_PRICING, X402_HEADER, X402_REQUIREMENTS_HEADER } from "../x402";
import styles from "./ApiDocs.module.css";

export default function ApiDocs() {
  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <a href="/" className={styles.back}>← Back to FundChain</a>
        <span className={styles.badge}>AI Agent Compatible</span>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>FundChain REST API</h1>
        <p className={styles.lede}>
          The FundChain backend (<code className={styles.inline}>{API_BASE}</code>) is an Express service that
          exposes the on-chain Crowdfund contract over HTTP, protected by the
          <strong> x402 payment protocol</strong>. Reads are free; writes cost 0.0001 ETH per call,
          advertised via HTTP 402 responses and settled with an <code className={styles.inline}>{X402_HEADER}</code> retry.
        </p>

        <p className={styles.callout}>
          <strong>Run locally:</strong> <code>npm run node</code> (Hardhat) → <code>npm run deploy:local</code> →
          <code> npm run backend</code> → hit <code>{API_BASE}/health</code>.
        </p>

        <section className={styles.section}>
          <h2>Endpoints</h2>
          <table className={styles.table}>
            <thead>
              <tr><th>Method</th><th>Path</th><th>Price</th><th>Purpose</th></tr>
            </thead>
            <tbody>
              <tr><td>GET</td><td><code>/health</code></td><td>Free</td><td>Liveness + x402 mode</td></tr>
              <tr><td>GET</td><td><code>/api/docs</code></td><td>Free</td><td>Machine-readable endpoint list</td></tr>
              <tr><td>GET</td><td><code>/api/campaigns</code></td><td>Free</td><td>All campaigns, serialized with ETH amounts</td></tr>
              <tr><td>GET</td><td><code>/api/campaigns/:id</code></td><td>Free</td><td>Single campaign</td></tr>
              <tr><td>POST</td><td><code>/api/create</code></td><td>{API_PRICING["POST /api/create"].amountEth} ETH</td><td>Create a campaign on-chain</td></tr>
              <tr><td>POST</td><td><code>/api/donate</code></td><td>{API_PRICING["POST /api/donate"].amountEth} ETH</td><td>Execute a donation on-chain</td></tr>
            </tbody>
          </table>
        </section>

        <section className={styles.section}>
          <h2>x402 payment flow</h2>
          <ol className={styles.numbered}>
            <li>Agent sends the request without a payment header.</li>
            <li>Backend returns <strong>HTTP 402</strong> with an <code>{X402_REQUIREMENTS_HEADER}</code> header containing <code>{`{ scheme, network, asset, amount, payTo, route }`}</code>.</li>
            <li>Agent constructs a payment payload (real on-chain tx in production; any JSON in demo mode) and base64-encodes it.</li>
            <li>Agent retries with <code>{X402_HEADER}: &lt;base64&gt;</code>. Backend serves the route.</li>
          </ol>
          <p className={styles.note}>
            In demo mode (no <code>FACILITATOR_URL</code> set), the backend accepts any decodable header so you can
            exercise the full protocol shape against a local Hardhat chain. Flip to production by setting
            <code> FACILITATOR_URL</code> in <code>backend/.env</code> — the middleware then delegates to
            <code> x402-express</code> for real settlement.
          </p>
        </section>

        <section className={styles.section}>
          <h2>curl: browse campaigns (free)</h2>
          <pre className={styles.code}>
{`curl ${API_BASE}/api/campaigns | jq`}
          </pre>
        </section>

        <section className={styles.section}>
          <h2>curl: donate with x402 retry (paid)</h2>
          <pre className={styles.code}>
{`# 1) First call gets HTTP 402 with payment requirements
curl -i -X POST ${API_BASE}/api/donate \\
  -H "Content-Type: application/json" \\
  -d '{"campaignId": 0, "amount": "0.01"}'

# 2) Construct a payment payload and base64-encode it
PAYLOAD=$(printf '%s' '{"note":"demo","route":"POST /api/donate"}' | base64)

# 3) Retry with X-PAYMENT header
curl -X POST ${API_BASE}/api/donate \\
  -H "Content-Type: application/json" \\
  -H "${X402_HEADER}: $PAYLOAD" \\
  -d '{"campaignId": 0, "amount": "0.01"}'`}
          </pre>
        </section>

        <section className={styles.section}>
          <h2>fetch: client-side helper</h2>
          <pre className={styles.code}>
{`import { x402Fetch } from "./x402";

// Handles the 402 → retry round trip automatically in demo mode.
const res = await x402Fetch("/api/donate", {
  method: "POST",
  body: { campaignId: 0, amount: "0.01" },
});
const json = await res.json();
console.log(json.txHash);`}
          </pre>
        </section>

        <section className={styles.section}>
          <h2>Contract direct (no backend)</h2>
          <p>
            Agents that prefer signing their own transactions can skip this gateway entirely
            and talk to the contract via ethers.js / viem / web3.py — the ABI is the API.
            See <code>frontend/src/abi.js</code> and <code>frontend/src/contract-address.json</code>.
          </p>
        </section>
      </main>
    </div>
  );
}
