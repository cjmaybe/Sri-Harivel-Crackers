const rateLimit = require("express-rate-limit");

// General safety net across all /api/ traffic.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});

// Tighter limit on login attempts, keyed by IP. Complements the DB-backed
// per-account lockout in server.js (which stops credential stuffing spread
// across many IPs against a single username).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many login attempts. Please try again in 15 minutes." }
});

// Prevents anonymous order-spam / DB flooding via the public order endpoint.
const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many orders submitted. Please try again later." }
});

// Uploads are already behind auth, but still worth capping.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads. Please try again later." }
});

module.exports = { apiLimiter, loginLimiter, orderLimiter, uploadLimiter };
