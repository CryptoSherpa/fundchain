# FundChain Python SDK

A tiny, zero-dependency Python client for the [FundChain](https://fundchain.vercel.app) crowdfunding REST gateway. Browse, create, and donate to campaigns from Python — the SDK handles the [x402](https://www.x402.org) micropayment handshake transparently.

## Install

```bash
pip install fundchain
```

## Quick start

```python
from fundchain import FundchainAgent

agent = FundchainAgent(wallet_key="0xYOURPRIVATEKEY")

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
