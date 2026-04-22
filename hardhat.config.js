require("@nomicfoundation/hardhat-toolbox");
// Load .env from the project root regardless of where hardhat is invoked from.
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const rawKey = (process.env.PRIVATE_KEY || "").trim();

// Quick sanity check — catch empty / obviously-malformed keys before they
// cascade into a confusing "No signers available" error inside the script.
function normalizeKey(k) {
  if (!k) return null;
  const stripped = k.startsWith("0x") || k.startsWith("0X") ? k.slice(2) : k;
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
    console.warn(
      `[hardhat.config] PRIVATE_KEY is set but not a 64-char hex string ` +
      `(got length ${stripped.length}). Sepolia deploys will fail — ` +
      `double-check your .env for whitespace, truncation, or a stray '0x'.`
    );
    return null;
  }
  return "0x" + stripped;
}
const privateKey = normalizeKey(rawKey);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: privateKey ? [privateKey] : [],
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
