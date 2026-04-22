const hre = require("hardhat");
const fs = require("fs");

// Canonical USDC addresses for live networks. Local/hardhat deploys MockUSDC.
const CANONICAL_USDC = {
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

const LOCAL_NETWORKS = new Set(["localhost", "hardhat"]);

async function main() {
  const net = hre.network.name;
  console.log(`Network: ${net}`);

  // ── 0. Signer preflight — fail loudly if the network has no accounts. ─────
  // On live networks hardhat.config passes [PRIVATE_KEY] when the env var is
  // set, else []. An empty accounts array → getSigners() returns [] → later
  // `deployer.address` throws "Cannot read properties of undefined".
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      `No signers available for network '${net}'. ` +
      `Set PRIVATE_KEY in .env (root project directory) and re-run. ` +
      `For localhost, start 'npx hardhat node' first.`
    );
  }
  const deployer = signers[0];
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${hre.ethers.formatEther(balance)} ETH`);
  if (balance === 0n) {
    throw new Error(`Deployer has 0 ETH on '${net}'. Fund it before deploying.`);
  }

  // ── 1. Resolve USDC address. Two clearly-separated paths. ────────────────
  const usdcAddress = LOCAL_NETWORKS.has(net)
    ? await deployLocalMockUSDC(signers)
    : resolveCanonicalUSDC(net);

  // ── 2. Deploy Crowdfund. ──────────────────────────────────────────────────
  const Crowdfund = await hre.ethers.getContractFactory("Crowdfund");
  const crowdfund = await Crowdfund.deploy(usdcAddress);
  await crowdfund.waitForDeployment();
  const crowdfundAddress = await crowdfund.getAddress();
  console.log("Crowdfund deployed to:", crowdfundAddress);
  console.log("Owner (platform fee recipient):", deployer.address);

  // ── 3. Write addresses for the frontend. ─────────────────────────────────
  const config = { address: crowdfundAddress, usdc: usdcAddress, network: net };
  fs.mkdirSync("frontend/src", { recursive: true });
  fs.writeFileSync("frontend/src/contract-address.json", JSON.stringify(config, null, 2));
  console.log("Contract addresses written to frontend/src/contract-address.json");
}

/** Local-only: deploy MockUSDC and seed the first 5 test accounts with 10k mUSDC. */
async function deployLocalMockUSDC(signers) {
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy();
  await mockUsdc.waitForDeployment();
  const address = await mockUsdc.getAddress();
  console.log("MockUSDC deployed to:", address);

  const seedAmount = 10_000n * 10n ** 6n; // 10,000 mUSDC (6 decimals)
  const toSeed = signers.slice(0, Math.min(5, signers.length));
  for (const s of toSeed) {
    await (await mockUsdc.mint(s.address, seedAmount)).wait();
    console.log(`  minted 10,000 mUSDC to ${s.address}`);
  }
  return address;
}

/** Live-network path: look up canonical USDC. Never touches MockUSDC. */
function resolveCanonicalUSDC(networkName) {
  const address = CANONICAL_USDC[networkName];
  if (!address) {
    throw new Error(
      `No canonical USDC address configured for network '${networkName}'. ` +
      `Add it to CANONICAL_USDC in scripts/deploy.js.`
    );
  }
  console.log(`Using canonical USDC at: ${address}`);
  return address;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
