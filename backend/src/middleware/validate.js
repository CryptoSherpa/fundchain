// Hand-rolled body validators. Each returns a normalized payload on success,
// throws Error on bad input. Kept dep-free to minimize surface.

const MAX_STRING = 4000;
const MAX_DURATION_DAYS = 365;

// Per-currency goal bounds, mirroring the contract.
const BOUNDS = {
  ETH:  { min: 0.001,    max: 10_000 },
  USDC: { min: 1,        max: 10_000_000 },
};

function requireString(v, field, max = MAX_STRING) {
  if (typeof v !== "string") throw new Error(`${field} must be a string`);
  const s = v.trim();
  if (s.length === 0) throw new Error(`${field} must not be empty`);
  if (s.length > max) throw new Error(`${field} exceeds max length (${max})`);
  return s;
}

function requireInt(v, field, { min = -Infinity, max = Infinity } = {}) {
  if (typeof v === "string") v = v.trim();
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${field} must be an integer`);
  if (n < min || n > max) throw new Error(`${field} out of range [${min}, ${max}]`);
  return n;
}

function requireDecimalString(v, field, { min, max }) {
  if (typeof v !== "string" && typeof v !== "number") {
    throw new Error(`${field} must be a decimal as string or number`);
  }
  const s = String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`${field} must match /^\\d+(\\.\\d+)?$/`);
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`${field} must be in [${min}, ${max}]`);
  }
  return s;
}

function requireCurrency(v) {
  // Accept "ETH"/"USDC" (case-insensitive), 0/1, "0"/"1".
  if (typeof v === "string") {
    const up = v.trim().toUpperCase();
    if (up === "ETH" || up === "0") return 0;
    if (up === "USDC" || up === "1") return 1;
  }
  if (v === 0 || v === 1) return v;
  throw new Error("currency must be 'ETH' | 'USDC' (or 0 | 1)");
}

export function validateCreateBody(body) {
  if (!body || typeof body !== "object") throw new Error("Body must be JSON object");
  const currency = requireCurrency(body.currency ?? "ETH");
  const bounds = currency === 0 ? BOUNDS.ETH : BOUNDS.USDC;
  return {
    title: requireString(body.title, "title", 200),
    description: requireString(body.description, "description", 4000),
    category: requireString(body.category, "category", 100),
    imageUrl: body.imageUrl ? requireString(body.imageUrl, "imageUrl", 500) : "",
    goalAmount: requireDecimalString(body.goalAmount ?? body.goalEth, "goalAmount", bounds),
    durationDays: requireInt(body.durationDays, "durationDays", { min: 1, max: MAX_DURATION_DAYS }),
    currency,
  };
}

export function validateDonateBody(body) {
  if (!body || typeof body !== "object") throw new Error("Body must be JSON object");
  // Note: the actual currency is determined by the target campaign at execution
  // time; we just validate the amount format here. Caller fills in currency.
  return {
    campaignId: requireInt(body.campaignId, "campaignId", { min: 0, max: 1e9 }),
    amount: requireDecimalString(body.amount, "amount", { min: 0.0000001, max: 10_000_000 }),
  };
}
