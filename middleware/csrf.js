const crypto = require("crypto");

const COOKIE_NAME = "csrf_token";
const HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isProd() {
  return process.env.NODE_ENV === "production";
}

/**
 * Ensures every visitor has a CSRF cookie. Runs on every request, before
 * routes, so the token is always available for the client to read back via
 * GET /api/csrf-token.
 */
function attachCsrfToken(req, res, next) {
  let token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false, // must be readable so the client can echo it back as a header
      sameSite: "strict",
      secure: isProd(),
      maxAge: 12 * 60 * 60 * 1000,
      path: "/"
    });
  }
  req.csrfToken = token;
  next();
}

/**
 * Verifies the double-submit token on state-changing requests. The cookie
 * is sent automatically by the browser; the header can only be set by
 * same-origin JavaScript (a cross-site attacker's page cannot read our
 * cookie value to forge a matching header), so a mismatch means the request
 * did not originate from our own front end.
 */
function verifyCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const cookieToken = req.cookies && req.cookies[COOKIE_NAME];
  const headerToken = req.headers[HEADER_NAME];
  if (
    cookieToken &&
    headerToken &&
    typeof headerToken === "string" &&
    cookieToken.length === headerToken.length &&
    crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
  ) {
    return next();
  }
  return res.status(403).json({ error: "Invalid or missing CSRF token" });
}

module.exports = { attachCsrfToken, verifyCsrfToken, COOKIE_NAME, HEADER_NAME };
