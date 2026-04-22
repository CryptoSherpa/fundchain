# FundChain — Decentralized Crowdfunding dApp

A GoFundMe-style crowdfunding platform built on Ethereum. Campaign creators set a goal and deadline; donors contribute ETH; if the goal is met, the creator claims 95% of the raised funds and 5% goes to the platform owner. If the goal is not met, donors can claim full refunds.

## Project Structure

```
crowdfund-dapp/
├── contracts/
│   └── Crowdfund.sol        # Main smart contract
├── scripts/
│   └── deploy.js            # Deployment script (auto-writes address to frontend)
├── test/
│   └── Crowdfund.test.js    # Hardhat tests
├── frontend/                # React + Vite frontend
│   └── src/
│       ├── App.jsx
│       ├── useContract.js   # Wallet + contract hook
│       ├── abi.js           # Contract ABI
│       ├── components/
│       │   ├── Header.jsx
│       │   ├── CreateCampaign.jsx
│       │   └── CampaignCard.jsx
│       └── contract-address.json   # Written by deploy script
├── hardhat.config.js
└── .env.example
```

## Quick Start (Local)

### 1. Install dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Start a local Hardhat node

```bash
npm run node
# Leave this running in a terminal
```

### 3. Deploy the contract

```bash
npm run deploy:local
# This writes the contract address to frontend/src/contract-address.json
```

### 4. Start the frontend

```bash
npm run frontend
# Open http://localhost:5173
```

### 5. Connect MetaMask to localhost

- Network: `Localhost 8545` (or add manually: RPC `http://127.0.0.1:8545`, Chain ID `31337`)
- Import one of the Hardhat test accounts using its private key (printed by `npm run node`)

## Deploy to Sepolia Testnet

### 1. Create `.env` from the example

```bash
cp .env.example .env
```

Fill in:
- `SEPOLIA_RPC_URL` — get a free endpoint from [Infura](https://infura.io) or [Alchemy](https://alchemy.com)
- `PRIVATE_KEY` — your wallet's private key (fund it with Sepolia ETH from a faucet)
- `ETHERSCAN_API_KEY` — optional, for contract verification

### 2. Deploy

```bash
npm run deploy:sepolia
```

### 3. Update frontend to point at Sepolia

The deploy script automatically writes `frontend/src/contract-address.json`. Build and deploy the frontend wherever you like:

```bash
cd frontend && npm run build
```

## Smart Contract Details

**Crowdfund.sol**

| Function | Description |
|---|---|
| `createCampaign(title, desc, goal, deadline)` | Creates a new campaign |
| `donate(id)` | Donates ETH to a campaign (payable) |
| `claimFunds(id)` | Creator claims funds after a successful campaign |
| `refund(id)` | Donor reclaims ETH from a failed campaign |
| `getCampaign(id)` | Read all campaign data |
| `getContribution(id, donor)` | Read a donor's contribution |

**Fee:** 5% platform fee deducted on `claimFunds`, sent to the contract deployer.

## Run Tests

```bash
npm test
```

All 5 tests cover: campaign creation, donations, successful fund release with fee, refunds on failure, and revert on invalid refund.
