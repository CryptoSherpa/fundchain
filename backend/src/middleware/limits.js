import rateLimit from "express-rate-limit";

/** Shared write-endpoint rate limiter: 10 requests / minute / IP. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many write requests" },
});
