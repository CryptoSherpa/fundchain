// x402 payment middleware.
//
// Two modes:
//   • PRODUCTION — if FACILITATOR_URL is set, delegates to the real
//     `x402-express` paymentMiddleware, which verifies the X-PAYMENT
//     header against a facilitator and settles on-chain.
//   • DEMO (default for local Hardhat) — advertises payment requirements
//     via HTTP 402 per the x402 spec but accepts any decodable X-PAYMENT
//     on retry. No on-chain settlement. This exists so the backend runs
//     against a local chain where no x402 facilitator is deployed.
//
// Either way, clients see the same protocol shape: 402 + requirements on
// first hit, 200 with X-PAYMENT on retry.

import { paymentMiddleware } from "x402-express";

const X402_HEADER = "X-PAYMENT";
const REQUIREMENTS_HEADER = "X-Payment-Required";

const facilitatorUrl = process.env.FACILITATOR_URL;
const network = process.env.X402_NETWORK || "base-sepolia";
const payTo = process.env.OWNER_ADDRESS || "0x0000000000000000000000000000000000000000";

export const X402_MODE = facilitatorUrl ? "production" : "demo";

export function x402Protect(route, priceEth = "0.0001") {
  if (facilitatorUrl) {
    // Real middleware — delegates to facilitator for verification/settlement.
    return paymentMiddleware(
      payTo,
      { [route]: { price: priceEth, network } },
      { url: facilitatorUrl },
    );
  }

  // Demo mode.
  return (req, res, next) => {
    const requirements = {
      scheme: "exact",
      network: "localhost",
      asset: "eth",
      amount: priceEth,
      payTo,
      route,
      description: `x402 micropayment for ${route}`,
    };

    const header = req.get(X402_HEADER);
    if (!header) {
      res.set(REQUIREMENTS_HEADER, JSON.stringify(requirements));
      return res.status(402).json({
        error: "Payment Required",
        mode: "demo",
        requirements,
        retry: `Resubmit the request with header '${X402_HEADER}: <base64(JSON payment payload)>'.`,
      });
    }

    try {
      req.x402Payment = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      return res.status(402).json({ error: "Invalid X-PAYMENT header (expected base64-encoded JSON)" });
    }

    // In demo mode we log but don't verify on-chain. Swap in FACILITATOR_URL
    // to enable real settlement via x402-express.
    console.log(`[x402:demo] accepted payment for ${route}:`, req.x402Payment);
    next();
  };
}
