# FundChain Python SDK

A tiny, zero-dependency Python client for the [FundChain](https://fundchain.vercel.app) crowdfunding REST gateway. Browse, create, and donate to campaigns from Python — the SDK handles the [x402](https://www.x402.org) micropayment handshake transparently.

## Install

```bash
pip install fundchain
```

## Quick start

```python
import os
from fundchain import FundchainAgent

agent = FundchainAgent(
    wallet_key=os.environ["AGENT_WALLET_KEY"],  # Never hardcode!
)

# Free
campaigns = agent.list_campaigns()
print(f"{campaigns['count']} active campaigns")

# x402-paid (0.0001 ETH gateway fee, handled automatically)
result = agent.create_campaign(
    title="Solar panels for the school",
    description="Funding a 10kW solar array for the village school.",
    goal_eth="2.5",
    duration_days=30,
    category="Community",
    currency="ETH",
)
print("created campaign", result["campaignId"], "tx", result["txHash"])

# x402-paid
agent.donate(campaign_id=result["campaignId"], amount_eth="0.05")
```

## Connect your wallet to your agent

The SDK signs transactions with an EVM private key. Set up a dedicated wallet, fund it, and pass the key in via an environment variable — never hardcode it.

> ⚠️ **Security first:** create a **dedicated agent wallet** — never use your main wallet. The agent signs autonomously, so anything in the wallet is fair game for the agent (and anyone who compromises the key). Keep the balance small.

### 1. Create a dedicated wallet in MetaMask

1. MetaMask → account icon (top right) → **Add account or hardware wallet** → **Add a new Ethereum account**.
2. Name it `fundchain-agent` so you don't confuse it with your main wallet.
3. Copy the new account's **public address** — you'll send funds here.

### 2. Export the private key

1. With the agent account selected, click the ⋮ menu → **Account details** → **Show private key**.
2. Enter your MetaMask password and reveal the key. It looks like `0xabc123…` (64 hex chars after the `0x`).
3. Copy it once — paste it straight into an environment variable. Do **not** save it in a file or paste it into chat.

### 3. Fund it

* Send a small amount of **ETH** for gas + x402 fees (0.0001 ETH per write). Start with ~0.01 ETH — enough for ~100 calls.
* If you'll donate in **USDC**, send some USDC too (gas is still paid in ETH).
* On testnets, grab ETH from a faucet (e.g. [Sepolia faucet](https://sepoliafaucet.com)) and USDC from [Circle's testnet faucet](https://faucet.circle.com).

### 4. Wire the key into your shell

```bash
# In ~/.zshrc, ~/.bashrc, or a project-local .env (gitignored!)
export AGENT_WALLET_KEY="0xabc123...your-agent-wallet-private-key"
```

Then in Python:

```python
import os
from fundchain import FundchainAgent

agent = FundchainAgent(wallet_key=os.environ["AGENT_WALLET_KEY"])
```

If you prefer a `.env` file, [`python-dotenv`](https://pypi.org/project/python-dotenv/) loads it for you — but make sure `.env` is in `.gitignore`.

### Security best practices

* **Dedicated wallet only** — never reuse your main wallet. Treat the agent wallet like a hot wallet for a single app.
* **Environment variables only** — never commit the key to git, paste it into a prompt, or hardcode it in source. Add `.env` to `.gitignore`.
* **Keep the balance small** — top up as the agent works. A drained wallet limits the blast radius of a compromised key.
* **Monitor on Etherscan** — bookmark the agent address on [Etherscan](https://etherscan.io) (or the appropriate L2 explorer) to watch activity.
* **Rotate immediately if compromised** — generate a new wallet, move funds, swap the env var. The old key is permanently burned.
* **Set spend caps in your prompts** — tell the agent its budget ("donate at most 0.05 ETH total"); models will respect explicit limits.

## Pointing at a different backend

```python
agent = FundchainAgent(
    wallet_key="0x...",
    api_url="http://localhost:3001",  # local Hardhat backend
)
```

## API

| Method | Returns | Cost |
| --- | --- | --- |
| `list_campaigns()` | `{"count": N, "campaigns": [...]}` | Free |
| `get_campaign(campaign_id)` | Single serialized campaign | Free |
| `create_campaign(title, goal_eth, duration_days, description, category, currency="ETH", image_url="")` | `{"ok": True, "txHash": ..., "campaignId": N, ...}` | 0.0001 ETH (x402) |
| `donate(campaign_id, amount_eth, currency="ETH")` | `{"ok": True, "txHash": ..., ...}` | donation + 0.0001 ETH (x402) |

Errors are raised as `FundchainError(message, status, body)`.

## Production payments

In demo mode (the gateway's default for local Hardhat) the backend accepts any decodable x402 payload, so the SDK works out of the box for development. For production, the SDK's `_encode_payment_header` should be extended to construct a signed on-chain payment reference using `wallet_key` that the configured [x402 facilitator](https://www.x402.org) can verify.

## See also

* [`examples/basic_usage.py`](examples/basic_usage.py) — full end-to-end flow
* [FundChain docs](https://fundchain.vercel.app/docs)
* [FundChain MCP server](https://www.npmjs.com/package/@fundchain/mcp) — same surface for Claude Desktop
