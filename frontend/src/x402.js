// x402 — HTTP-native payments (client-side helpers).
//
// The FundChain backend (see /backend) implements these endpoints and
// follows the x402 protocol: unpaid requests get HTTP 402 with payment
// requirements in the X-Payment-Required response header; clients retry
// with an X-PAYMENT request header containing a base64-encoded JSON
// payment payload.
//
// Spec reference: https://www.x402.org

export const API_BASE = import.meta.env.VITE_API_BASE || "https://fundchain.up.railway.app";

export const X402_HEADER = "X-PAYMENT";
export const X402_REQUIREMENTS_HEADER = "X-Payment-Required";

/** Standard pricing for the (hypothetical) AI-agent API endpoints. */
export const API_PRICING = {
  "GET /api/campaigns": { amountEth: "0", description: "Browse campaigns (free)" },
  "POST /api/donate":   { amountEth: "0.0001", description: "Execute a donation" },
  "POST /api/create":   { amountEth: "0.0001", description: "Create a campaign" },
};

/** Build an x402 payment-requirement payload that a server would include in
 *  its HTTP 402 response to advertise cost + recipient. */
export function buildPaymentRequirements({ route, recipient, network = "base-sepolia" }) {
  const pricing = API_PRICING[route];
  if (!pricing) throw new Error(`Unknown route: ${route}`);
  return {
    scheme: "exact",
    network,
    asset: "eth",
    amount: pricing.amountEth,
    recipient,
    route,
    description: pricing.description,
  };
}

/** Encode an x402 payment payload into the X-PAYMENT header value. */
export function encodePaymentHeader(payload) {
  return btoa(JSON.stringify({ ts: Date.now(), ...payload }));
}

/** Decode an X-PAYMENT header value back into its components. */
export function decodePaymentHeader(headerValue) {
  try {
    return JSON.parse(atob(headerValue));
  } catch {
    return null;
  }
}

/** Wrap a fetch with x402: on 402, read the requirements, let the caller
 *  mint a payment payload, then retry with the X-PAYMENT header. In demo
 *  mode the backend accepts any decodable payload; in production the
 *  facilitator verifies a real on-chain tx. */
export async function x402Fetch(path, { method = "GET", body, makePayment } = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const init = {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  };
  let res = await fetch(url, init);
  if (res.status !== 402) return res;

  const requirementsHeader = res.headers.get(X402_REQUIREMENTS_HEADER);
  const requirements = requirementsHeader ? JSON.parse(requirementsHeader) : (await res.json()).requirements;
  const paymentPayload = await (makePayment?.(requirements) ?? Promise.resolve({
    note: "demo-payload",
    route: requirements.route,
    ts: Date.now(),
  }));
  const paymentHeader = encodePaymentHeader(paymentPayload);
  return fetch(url, { ...init, headers: { ...init.headers, [X402_HEADER]: paymentHeader } });
}
