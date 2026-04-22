import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

import campaignsRouter from "./routes/campaigns.js";
import donateRouter from "./routes/donate.js";
import { CONTRACT_ADDRESS, SIGNER_ADDRESS } from "./contract.js";
import { X402_MODE } from "./middleware/x402.js";

dotenv.config();

// Hard refuse to boot in demo-x402 mode if NODE_ENV=production. In demo mode
// the backend accepts any decodable X-PAYMENT header, so every paid endpoint
// becomes free-gas — an attacker could drain the backend signer's ETH by
// flooding donate/create calls. Production deployments MUST set FACILITATOR_URL.
if (process.env.NODE_ENV === "production" && !process.env.FACILITATOR_URL) {
  console.error("Refusing to start: NODE_ENV=production requires FACILITATOR_URL for real x402 settlement.");
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 3001);

// When running behind a reverse proxy (nginx, Cloudflare, Render, etc.) the
// client IP lives in X-Forwarded-For. Uncomment and set the hop count or
// trusted CIDR for your deployment — otherwise express-rate-limit sees only
// the proxy's IP and effectively rate-limits the whole world as one client.
// app.set("trust proxy", 1);

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  // Our responses are JSON + a small docs page; the strict defaults are fine.
  // Allow the x402 requirements header through CORS exposure below.
}));

// ── CORS: explicit origin allowlist from env ───────────────────────────────
const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser tools (no Origin header) and explicitly-listed origins.
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    const err = new Error(`Origin ${origin} not allowed by CORS`);
    err.status = 403;
    return cb(err);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-PAYMENT"],
  exposedHeaders: ["X-Payment-Required"],
  maxAge: 600,
}));

// ── Body parsing: cap to 10 KB (campaigns are small) ───────────────────────
app.use(express.json({ limit: "10kb" }));

// ── Rate limits ─────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,                 // 2 rps per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});
app.use(globalLimiter);

// ── Health — free ───────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    ts: Date.now(),
    x402Mode: X402_MODE,
    contract: CONTRACT_ADDRESS,
    signer: SIGNER_ADDRESS,
  });
});

// ── Docs — free ────────────────────────────────────────────────────────────
app.get("/api/docs", (_req, res) => {
  res.json({
    name: "FundChain REST API",
    version: "0.2.0",
    contract: CONTRACT_ADDRESS,
    signer: SIGNER_ADDRESS,
    x402: {
      mode: X402_MODE,
      header: "X-PAYMENT",
      requirementsHeader: "X-Payment-Required",
      amountEth: "0.0001",
      payTo: process.env.OWNER_ADDRESS || null,
      note: X402_MODE === "demo"
        ? "Demo mode: protocol shape only, no on-chain settlement."
        : "Production mode: payments verified by x402-express against FACILITATOR_URL.",
    },
    endpoints: [
      { method: "GET",  path: "/health",             price: "free" },
      { method: "GET",  path: "/api/docs",           price: "free" },
      { method: "GET",  path: "/api/campaigns",      price: "free" },
      { method: "GET",  path: "/api/campaigns/:id",  price: "free" },
      { method: "POST", path: "/api/create",         price: "0.0001 ETH", body: ["title", "description", "category", "imageUrl?", "goalAmount", "durationDays", "currency (ETH|USDC)"] },
      { method: "POST", path: "/api/donate",         price: "0.0001 ETH", body: ["campaignId", "amount (decimal in the campaign's currency)"] },
    ],
    limits: {
      minGoalEth: 0.001,
      maxGoalEth: 10000,
      maxDurationDays: 365,
      maxBodyBytes: 10240,
      rateLimit: { global: "120/min", writes: "10/min" },
    },
  });
});

// ── Routers ─────────────────────────────────────────────────────────────────
app.use("/api", campaignsRouter);           // mounts /api/campaigns, /:id, /create
app.use("/api/donate", donateRouter);       // writeLimiter is applied per-route in donate.js

// ── Error sink: never leak stack traces ─────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[server error]", err);
  res.status(err.status || 500).json({ error: err.message || "Internal error" });
});

app.listen(port, () => {
  console.log(`FundChain backend listening on http://localhost:${port}`);
  console.log(`  x402 mode: ${X402_MODE}`);
  console.log(`  contract:  ${CONTRACT_ADDRESS}`);
  console.log(`  signer:    ${SIGNER_ADDRESS}`);
  console.log(`  origins:   ${allowedOrigins.join(", ")}`);
});

