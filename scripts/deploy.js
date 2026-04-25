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

  // ── -1. Mainnet preflight — fail before touching the network. ────────────
  // Catches a misconfigured mainnet deploy at zero RPC cost so it can't get
  // partway through the run before discovering OWNER_ADDRESS is missing.
  requireOwnerOnMainnet(net);

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

  // ── 2. Resolve owner / fee recipient. ─────────────────────────────────────
  // OWNER_ADDRESS in .env lets a deployer route platform fees to a cold or
  // multisig wallet. When unset (or set to the zero address) the contract
  // falls back to msg.sender, which is the deployer — preserved on test
  // networks. The mainnet preflight above already enforces OWNER_ADDRESS.
  const ownerArg = resolveOwner(deployer.address);

  // ── 3. Deploy Crowdfund. ──────────────────────────────────────────────────
  const Crowdfund = await hre.ethers.getContractFactory("Crowdfund");
  const crowdfund = await Crowdfund.deploy(usdcAddress, ownerArg);
  await crowdfund.waitForDeployment();
  const crowdfundAddress = await crowdfund.getAddress();
  const onChainOwner = await crowdfund.owner();
  console.log("Crowdfund deployed to:", crowdfundAddress);
  console.log("Owner (platform fee recipient):", onChainOwner);
  if (onChainOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log(`  (overridden via OWNER_ADDRESS; deployer was ${deployer.address})`);
  }

  // ── 4. Write addresses for the frontend. ─────────────────────────────────
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

/** Mainnet guard: a missing OWNER_ADDRESS on mainnet means platform fees
 *  flow to the deployer's hot key forever (the contract's `owner` is
 *  immutable). Surface a loud, hard error so the deploy can't proceed by
 *  accident; the deployer can still set OWNER_ADDRESS to their own address
 *  if that's genuinely intended. */
function requireOwnerOnMainnet(networkName) {
  if (networkName !== "mainnet") return;
  const raw = (process.env.OWNER_ADDRESS || "").trim();
  if (raw && raw !== hre.ethers.ZeroAddress) return;

  const banner = "═".repeat(72);
  const lines = [
    "",
    banner,
    "  ⚠   MAINNET DEPLOY BLOCKED — OWNER_ADDRESS is not set in .env   ⚠",
    banner,
    "",
    "  The Crowdfund contract's `owner` is immutable and receives ALL",
    "  platform fees forever. Without OWNER_ADDRESS, fees would be paid",
    "  to the deployer wallet (a hot key) — almost certainly not what",
    "  you want for a real mainnet deployment.",
    "",
    "  Fix:",
    "    1. Edit .env in the project root.",
    "    2. Set OWNER_ADDRESS=<address>  (multisig / cold wallet recommended).",
    "    3. Re-run `npm run deploy:mainnet`.",
    "",
    "  If you genuinely want the deployer to be the fee recipient, set",
    "  OWNER_ADDRESS to that same deployer address explicitly.",
    "",
    banner,
    "",
  ];
  console.error(lines.join("\n"));
  throw new Error("OWNER_ADDRESS is required for mainnet deploys.");
}

/** Resolve the owner argument for the Crowdfund constructor.
 *  - Unset / empty / "0x0…" → ethers.ZeroAddress so the contract uses msg.sender.
 *  - Anything else must be a valid 20-byte hex address; reject early otherwise.
 */
function resolveOwner(deployerAddress) {
  const raw = (process.env.OWNER_ADDRESS || "").trim();
  if (!raw) {
    console.log(`OWNER_ADDRESS not set — using deployer (${deployerAddress}) as owner.`);
    return hre.ethers.ZeroAddress;
  }
  if (!hre.ethers.isAddress(raw)) {
    throw new Error(`OWNER_ADDRESS in .env is not a valid Ethereum address: '${raw}'`);
  }
  if (raw === hre.ethers.ZeroAddress) {
    console.log("OWNER_ADDRESS is the zero address — using deployer as owner.");
    return hre.ethers.ZeroAddress;
  }
  const checksummed = hre.ethers.getAddress(raw);
  console.log(`OWNER_ADDRESS set — fees will route to ${checksummed}`);
  return checksummed;
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
