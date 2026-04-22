import { ethers } from "ethers";
import dotenv from "dotenv";
import { readFileSync } from "fs";

dotenv.config();

const CROWDFUND_ABI = [
  "function campaignCount() view returns (uint256)",
  "function getClaimThreshold() pure returns (uint256)",
  "function CLAIM_THRESHOLD_BPS() view returns (uint256)",
  "function PLATFORM_FEE_BPS() view returns (uint256)",
  "function MIN_GOAL_ETH() view returns (uint256)",
  "function MAX_GOAL_ETH() view returns (uint256)",
  "function MIN_GOAL_USDC() view returns (uint256)",
  "function MAX_GOAL_USDC() view returns (uint256)",
  "function MAX_DURATION() view returns (uint256)",
  "function USDC_TOKEN() view returns (address)",
  "function createCampaign(string title, string description, string category, string imageUrl, uint256 goal, uint256 deadline, uint8 currency) returns (uint256)",
  "function donate(uint256 id, uint256 amount) payable",
  "function claimFunds(uint256 id)",
  "function processRefunds(uint256 id)",
  "function refund(uint256 id)",
  "function getCampaign(uint256 id) view returns (address creator, string title, string description, string category, string imageUrl, uint256 goal, uint256 deadline, uint256 amountRaised, bool claimed, bool refundsProcessed, uint256 donorCount, uint8 currency)",
  "function getCampaignCurrency(uint256 id) view returns (uint8)",
  "function getContribution(uint256 id, address donor) view returns (uint256)",
  "event CampaignCreated(uint256 indexed id, address indexed creator, string title, string category, uint256 goal, uint256 deadline, uint8 currency)",
  "event DonationReceived(uint256 indexed id, address indexed donor, uint256 amount)",
  "event FundsClaimed(uint256 indexed id, uint256 creatorAmount, uint256 feeAmount)",
  "error CampaignNotFound()",
  "error CampaignEnded()",
  "error CampaignNotEnded()",
  "error CampaignAlreadyClaimed()",
  "error ClaimThresholdNotMet()",
  "error ClaimThresholdMet()",
  "error AlreadyClaimed()",
  "error AlreadyProcessed()",
  "error NothingToRefund()",
  "error NotCreator()",
  "error TransferFailed()",
  "error ZeroDonation()",
  "error GoalBelowMin()",
  "error GoalAboveMax()",
  "error DeadlineMustBeFuture()",
  "error DeadlineTooFar()",
  "error AmountMustBeZeroForETH()",
  "error MsgValueMustBeZeroForUSDC()",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const privateKey = process.env.PRIVATE_KEY;
let contractAddress = process.env.CONTRACT_ADDRESS;
let usdcAddress = process.env.USDC_ADDRESS;

// If USDC_ADDRESS isn't in env, try loading it from the frontend config that
// the deploy script wrote. Keeps local dev single-source-of-truth.
if (!usdcAddress) {
  try {
    const cfg = JSON.parse(readFileSync(new URL("../../frontend/src/contract-address.json", import.meta.url), "utf8"));
    if (!contractAddress) contractAddress = cfg.address;
    if (cfg.usdc) usdcAddress = cfg.usdc;
  } catch { /* ignore — CONTRACT_ADDRESS may still be set explicitly */ }
}

if (!contractAddress) throw new Error("CONTRACT_ADDRESS is not set");
if (!privateKey) throw new Error("PRIVATE_KEY is not set");

export const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
export const signer = new ethers.NonceManager(wallet);
export const SIGNER_ADDRESS = wallet.address;

export const contract = new ethers.Contract(contractAddress, CROWDFUND_ABI, signer);
export const readContract = new ethers.Contract(contractAddress, CROWDFUND_ABI, provider);

export const usdcContract = usdcAddress
  ? new ethers.Contract(usdcAddress, ERC20_ABI, signer)
  : null;

export const CONTRACT_ADDRESS = contractAddress;
export const USDC_ADDRESS = usdcAddress;
export { CROWDFUND_ABI, ERC20_ABI };
