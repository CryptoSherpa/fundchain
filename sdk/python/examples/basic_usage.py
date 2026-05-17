"""End-to-end FundChain SDK example.

Run against a local backend:
    cd backend && npm run dev    # in another terminal
    python examples/basic_usage.py
"""

import os

from fundchain import FundchainAgent, FundchainError


def main() -> None:
    agent = FundchainAgent(
        wallet_key=os.environ.get("FUNDCHAIN_WALLET_KEY", "0xDEMO" + "0" * 60),
        api_url=os.environ.get("FUNDCHAIN_API_URL", "https://fundchain.up.railway.app"),
    )

    # 1) Browse — free.
    listing = agent.list_campaigns()
    print(f"{listing['count']} campaigns on chain")
    for c in listing["campaigns"][:5]:
        print(f"  #{c['id']:>3}  {c['title'][:40]:<40}  goal={c['goalFormatted']} {c['currencySymbol']}")

    # 2) Look at one.
    if listing["campaigns"]:
        one = agent.get_campaign(listing["campaigns"][0]["id"])
        print(f"\ncampaign #{one['id']} raised {one['amountRaisedFormatted']} {one['currencySymbol']} "
              f"from {one['donorCount']} donor(s)")

    # 3) Create — x402-paid. SDK handles the 402 → retry transparently.
    try:
        created = agent.create_campaign(
            title="Demo from Python SDK",
            description="Created via the FundChain Python SDK example.",
            goal_eth="0.5",
            duration_days=14,
            category="Tech",
            currency="ETH",
        )
        print(f"\ncreated campaign #{created['campaignId']} → tx {created['txHash']}")
    except FundchainError as e:
        print(f"\ncreate failed (status={e.status}): {e}")
        return

    # 4) Donate — x402-paid + on-chain transfer.
    try:
        donation = agent.donate(campaign_id=created["campaignId"], amount_eth="0.01")
        print(f"donated → tx {donation['txHash']}")
    except FundchainError as e:
        print(f"donate failed (status={e.status}): {e}")


if __name__ == "__main__":
    main()
