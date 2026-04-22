import { ethers } from "ethers";

export const CATEGORIES = [
  "Technology & Innovation",
  "Creative Projects",
  "Publishing & Education",
  "Charity & Causes",
  "Business & Startups",
  "Games & Entertainment",
  "Fashion & Design",
  "Environment & Sustainability",
  "Food & Hospitality",
  "Science & Research",
  "Personal Funding",
];

/** Percent of the goal required for the creator to claim (mirrors the
 *  contract's getClaimThreshold() / CLAIM_THRESHOLD_BPS). */
export const CLAIM_THRESHOLD_PCT = 80;

/** Window (in seconds) before the deadline in which the creator can claim.
 *  Mirrors the contract's CLAIM_WINDOW = 7 days. */
export const CLAIM_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/** Derive display status from on-chain campaign data. */
export function getStatus(campaign) {
  const now = Date.now() / 1000;
  const thresholdMet = campaign.amountRaised * 100n >= campaign.goal * BigInt(CLAIM_THRESHOLD_PCT);
  const ended = now > Number(campaign.deadline);
  if (campaign.claimed) return "completed";
  if (thresholdMet) return "almost-funded";
  if (ended) return campaign.refundsProcessed ? "refunded" : "failed";
  return "active";
}

/** True when the current time is within the final CLAIM_WINDOW_SECONDS of the
 *  campaign deadline — i.e. the on-chain claimFunds() window is open. */
export function isInClaimWindow(deadline) {
  const now = Date.now() / 1000;
  return now >= Number(deadline) - CLAIM_WINDOW_SECONDS;
}

/** True when a creator can actually claim right now: threshold met AND inside
 *  the 7-day claim window. Keep in sync with claimFunds() in Crowdfund.sol. */
export function canClaim(campaign) {
  return getStatus(campaign) === "almost-funded" && isInClaimWindow(campaign.deadline);
}

/** A campaign is "past" once it has left the active feed: either the creator
 *  has claimed funds, or the deadline passed without hitting the goal. A
 *  goal-met-but-not-yet-claimed campaign stays in the active feed so the
 *  creator can find the Claim button. */
export function isPast(campaign) {
  const s = getStatus(campaign);
  return s === "completed" || s === "failed" || s === "refunded";
}

export function formatEth(wei) {
  return parseFloat(ethers.formatEther(wei)).toFixed(4);
}

/** USDC has 6 decimals. Format to 2 dp with a $ prefix. */
export function formatUsdc(baseUnits) {
  const n = Number(ethers.formatUnits(baseUnits, 6));
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Currency-aware amount formatter for display.
 *  campaign.currency is 0 (ETH) or 1 (USDC). */
export function formatAmount(baseUnits, currency) {
  return currency === 1 ? formatUsdc(baseUnits) : `${formatEth(baseUnits)} ETH`;
}

export function currencySymbol(currency) {
  return currency === 1 ? "USDC" : "ETH";
}

/** Parse a user-entered decimal string into base units for the given currency. */
export function parseAmount(str, currency) {
  return currency === 1 ? ethers.parseUnits(String(str), 6) : ethers.parseEther(String(str));
}

// ─── Simple ETH→USD price helper ──────────────────────────────────────────────
// CoinGecko public endpoint, cached in-memory for 5 minutes. Falls back to a
// hardcoded sentinel if the fetch fails (offline/rate-limited).

const ETH_USD_CACHE = { rate: null, fetchedAt: 0 };
const ETH_USD_TTL_MS = 5 * 60 * 1000;
const ETH_USD_FALLBACK = 3000; // rough sentinel only used when live fetch fails

export async function getEthUsdRate() {
  const now = Date.now();
  if (ETH_USD_CACHE.rate && now - ETH_USD_CACHE.fetchedAt < ETH_USD_TTL_MS) {
    return ETH_USD_CACHE.rate;
  }
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const json = await res.json();
    const rate = Number(json?.ethereum?.usd);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Bad rate payload");
    ETH_USD_CACHE.rate = rate;
    ETH_USD_CACHE.fetchedAt = now;
    return rate;
  } catch (e) {
    console.warn("[eth-usd] using fallback rate:", e.message);
    return ETH_USD_FALLBACK;
  }
}

/** Format an ETH wei amount as an approximate USD string (e.g. "≈ $3,210"). */
export function ethToApproxUsd(wei, ethUsdRate) {
  if (!ethUsdRate) return null;
  const eth = Number(ethers.formatEther(wei));
  const usd = eth * ethUsdRate;
  return `≈ ${usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`;
}

export function formatDate(ts) {
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function timeLeft(deadline) {
  const diff = Number(deadline) * 1000 - Date.now();
  if (diff <= 0) return "Ended";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m left`;
}

export function progressPct(campaign) {
  if (!campaign.goal || campaign.goal === 0n) return 0;
  return Math.min(100, Number((campaign.amountRaised * 100n) / campaign.goal));
}

export function shareUrl(campaignId) {
  return `${window.location.origin}${window.location.pathname}?campaign=${campaignId}`;
}

const PINATA_ENDPOINT = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB hard ceiling for this dApp

/** Upload a File to Pinata IPFS and return its gateway URL. Auth via
 *  VITE_PINATA_JWT (Bearer). Throws with a caller-readable message on any
 *  failure — CreateCampaign surfaces that verbatim. */
export async function uploadImage(file) {
  if (!file) throw new Error("No file provided");
  if (!file.size) throw new Error("File is empty (0 bytes)");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (${file.size} bytes, max ${MAX_UPLOAD_BYTES})`);
  }
  console.log("[Pinata] file:", { name: file.name, type: file.type, size: file.size });

  const jwt = import.meta.env.VITE_PINATA_JWT;
  if (!jwt) {
    throw new Error("VITE_PINATA_JWT is not set (restart dev server after editing .env)");
  }

  const formData = new FormData();
  formData.append("file", file);

  let res;
  try {
    res = await fetch(PINATA_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: formData,
    });
  } catch (e) {
    throw new Error(`Pinata request failed: ${e.message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Pinata upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const body = await res.json();
  if (!body?.IpfsHash) {
    throw new Error(`Pinata response missing IpfsHash: ${JSON.stringify(body).slice(0, 200)}`);
  }

  const url = `${PINATA_GATEWAY}/${body.IpfsHash}`;
  console.log("[Pinata] upload complete — CID:", body.IpfsHash, "url:", url);
  return url;
}
