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

To point at a different backend (local Hardhat, staging) or wire in your own agent wallet:

```json
{
  "mcpServers": {
    "fundchain": {
      "command": "npx",
      "args": ["-y", "@fundchain/mcp"],
      "env": {
        "AGENT_WALLET_KEY": "0x...",
        "FUNDCHAIN_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

## Connect your wallet to your agent

The MCP server needs a funded EVM wallet to create campaigns and donate on your behalf. Set up a dedicated wallet, fund it, and pass the key in via `AGENT_WALLET_KEY` — Claude Desktop will inject it into the MCP server's process at launch.

> ⚠️ **Security first:** create a **dedicated agent wallet** — never use your main wallet. The agent signs autonomously, so anything in the wallet is fair game for the agent (and anyone who compromises the key). Keep the balance small.

### 1. Create a dedicated wallet in MetaMask

1. MetaMask → account icon (top right) → **Add account or hardware wallet** → **Add a new Ethereum account**.
2. Name it `fundchain-agent` so you don't confuse it with your main wallet.
3. Copy the new account's **public address** — you'll send funds here.

### 2. Export the private key

1. With the agent account selected, click the ⋮ menu → **Account details** → **Show private key**.
2. Enter your MetaMask password and reveal the key. It looks like `0xabc123…`.
3. Paste it straight into the `env` block in `claude_desktop_config.json` (see below). Don't save it anywhere else.

### 3. Fund the wallet

* Send a small amount of **ETH** for gas + x402 fees (0.0001 ETH per write). Start with ~0.01 ETH.
* If donating in **USDC**, send some USDC too (gas is still paid in ETH).
* Testnet: grab ETH from a [Sepolia faucet](https://sepoliafaucet.com), USDC from [Circle's testnet faucet](https://faucet.circle.com).

### 4. Wire the key into Claude Desktop

```json
{
  "mcpServers": {
    "fundchain": {
      "command": "node",
      "args": ["/path/to/mcp/src/index.js"],
      "env": {
        "AGENT_WALLET_KEY": "0xabc123...your-agent-wallet-private-key",
        "FUNDCHAIN_API_URL": "https://fundchain.up.railway.app"
      }
    }
  }
}
```

Restart Claude Desktop. The key lives only in this config file and the spawned MCP server process — it never enters chat. The config file itself has plain-text key material, so:

* Make sure it's not in a synced/backed-up folder you don't control.
* Set restrictive file permissions: `chmod 600 ~/Library/Application\ Support/Claude/claude_desktop_config.json`.

### Security best practices

* **Dedicated wallet only** — never reuse your main wallet. Treat the agent wallet like a hot wallet for a single app.
* **Environment variables only** — never paste the key into chat, commit it to git, or hardcode it in source.
* **Keep the balance small** — top up as the agent works. A drained wallet limits the blast radius of a compromised key.
* **Monitor on Etherscan** — bookmark the agent address on [Etherscan](https://etherscan.io) (or the appropriate L2 explorer) to watch activity.
* **Rotate immediately if compromised** — generate a new wallet, move funds, swap the env var, restart Claude Desktop. The old key is permanently burned.
* **Set spend caps in your prompts** — tell Claude its budget ("donate at most 0.05 ETH total"); models respect explicit limits.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `AGENT_WALLET_KEY` | _(none)_ | Private key for the dedicated agent wallet. Required for paid writes in production; demo mode runs without it. |
| `FUNDCHAIN_API_URL` | `https://fundchain.up.railway.app` | FundChain REST gateway base URL |

## Run from source

```bash
cd mcp
npm install
node src/index.js
```

The server speaks MCP over stdio — pair it with `mcp-inspector` or any MCP client to drive it manually.
