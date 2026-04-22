import express from "express";
import { ethers } from "ethers";
import { contract, readContract, usdcContract, SIGNER_ADDRESS } from "../contract.js";
import { x402Protect } from "../middleware/x402.js";
import { writeLimiter } from "../middleware/limits.js";
import { validateDonateBody } from "../middleware/validate.js";

const router = express.Router();

// POST /api/donate — x402 protected. Branches on the target campaign's currency.
router.post(
  "/",
  writeLimiter,
  x402Protect("POST /api/donate"),
  async (req, res) => {
    let input;
    try {
      input = validateDonateBody(req.body);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    // Look up the campaign to know which currency to use.
    let currency;
    try {
      const c = await readContract.getCampaign(input.campaignId);
      currency = Number(c[11]); // 0 = ETH, 1 = USDC
    } catch (e) {
      if (/CampaignNotFound/.test(e.message)) return res.status(404).json({ error: "Campaign not found" });
      return res.status(500).json({ error: e.reason || e.message });
    }

    // Parse the amount with the currency's decimals — returns 400 on over-precision
    // (e.g. "1.1234567" for USDC) instead of a surprise 500 from ethers.
    let amountBase;
    try {
      amountBase = currency === 1
        ? ethers.parseUnits(input.amount, 6)
        : ethers.parseEther(input.amount);
    } catch {
      const dp = currency === 1 ? 6 : 18;
      return res.status(400).json({ error: `amount has too many decimals for currency (max ${dp})` });
    }

    try {
      let tx;
      if (currency === 0) {
        tx = await contract.donate(input.campaignId, 0, { value: amountBase });
      } else {
        if (!usdcContract) {
          return res.status(500).json({ error: "USDC contract not configured on backend" });
        }
        // Ensure the backend's signer has approved the Crowdfund to pull USDC.
        // We approve the exact amount needed — never an unbounded allowance.
        const allowance = await usdcContract.allowance(SIGNER_ADDRESS, contract.target);
        if (allowance < amountBase) {
          const approveTx = await usdcContract.approve(contract.target, amountBase);
          await approveTx.wait();
        }
        tx = await contract.donate(input.campaignId, amountBase);
      }

      const receipt = await tx.wait();
      res.json({
        ok: true,
        txHash: receipt.hash,
        campaignId: input.campaignId,
        amount: input.amount,
        currency: currency === 1 ? "USDC" : "ETH",
        donor: SIGNER_ADDRESS,
      });
    } catch (e) {
      res.status(500).json({ error: e.reason || e.message });
    }
  }
);

export default router;
