import express from "express";
import { ethers } from "ethers";
import { contract, readContract } from "../contract.js";
import { x402Protect } from "../middleware/x402.js";
import { writeLimiter } from "../middleware/limits.js";
import { validateCreateBody } from "../middleware/validate.js";

const router = express.Router();

function formatForCurrency(baseUnits, currency) {
  return currency === 1 ? ethers.formatUnits(baseUnits, 6) : ethers.formatEther(baseUnits);
}

function parseForCurrency(amount, currency) {
  return currency === 1 ? ethers.parseUnits(String(amount), 6) : ethers.parseEther(String(amount));
}

function serialize(id, c) {
  const currency = Number(c[11]);
  return {
    id,
    creator: c[0],
    title: c[1],
    description: c[2],
    category: c[3],
    imageUrl: c[4],
    goal: c[5].toString(),
    goalFormatted: formatForCurrency(c[5], currency),
    deadline: Number(c[6]),
    amountRaised: c[7].toString(),
    amountRaisedFormatted: formatForCurrency(c[7], currency),
    claimed: c[8],
    refundsProcessed: c[9],
    donorCount: Number(c[10]),
    currency,
    currencySymbol: currency === 1 ? "USDC" : "ETH",
  };
}

// GET /api/campaigns — free
router.get("/campaigns", async (_req, res) => {
  try {
    const count = Number(await readContract.campaignCount());
    const items = await Promise.all(
      Array.from({ length: count }, async (_, i) => serialize(i, await readContract.getCampaign(i)))
    );
    res.json({ count, campaigns: items });
  } catch (e) {
    res.status(500).json({ error: e.reason || e.message });
  }
});

// GET /api/campaigns/:id — free
router.get("/campaigns/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 0 || id > 1e9) {
    return res.status(400).json({ error: "Invalid campaign id" });
  }
  try {
    const c = await readContract.getCampaign(id);
    res.json(serialize(id, c));
  } catch (e) {
    if (/CampaignNotFound/.test(e.message)) return res.status(404).json({ error: "Campaign not found" });
    res.status(500).json({ error: e.reason || e.message });
  }
});

// POST /api/create — x402 protected, currency-aware
router.post(
  "/create",
  writeLimiter,
  x402Protect("POST /api/create"),
  async (req, res) => {
    let input;
    try {
      input = validateCreateBody(req.body);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    let goalBase;
    try {
      goalBase = parseForCurrency(input.goalAmount, input.currency);
    } catch {
      const dp = input.currency === 1 ? 6 : 18;
      return res.status(400).json({ error: `goalAmount has too many decimals for currency (max ${dp})` });
    }

    try {
      const deadline = Math.floor(Date.now() / 1000) + input.durationDays * 86400;
      const tx = await contract.createCampaign(
        input.title, input.description, input.category, input.imageUrl,
        goalBase, deadline, input.currency
      );
      const receipt = await tx.wait();
      const evt = receipt.logs
        .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; }})
        .find((x) => x?.name === "CampaignCreated");
      const id = evt ? Number(evt.args[0]) : null;
      res.json({
        ok: true,
        txHash: receipt.hash,
        campaignId: id,
        currency: input.currency === 1 ? "USDC" : "ETH",
        deadline,
      });
    } catch (e) {
      res.status(500).json({ error: e.reason || e.message });
    }
  }
);

export default router;
