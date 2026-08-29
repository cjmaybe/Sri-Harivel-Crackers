const crypto = require("crypto");
const logger = require("./logger");

const INSECURE_SECRETS = new Set([
  "change-this-secret-in-production",
  "secret",
  "keyboard cat",
  ""
]);

/**
 * Validates process.env and returns a resolved, typed config object.
 * Throws (refusing to boot) on insecure configuration in production.
 * In development, fills in safe ephemeral defaults with a loud warning.
 */
function loadConfig() {
  const NODE_ENV = process.env.NODE_ENV || "development";
  const isProd = NODE_ENV === "production";

  let SESSION_SECRET = process.env.SESSION_SECRET;
  if (!SESSION_SECRET || INSECURE_SECRETS.has(SESSION_SECRET)) {
    if (isProd) {
      throw new Error(
        "SESSION_SECRET is missing or insecure. Set a long random value in your " +
          "production environment (e.g. `node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"`) " +
          "before starting the server."
      );
    }
    SESSION_SECRET = crypto.randomBytes(48).toString("hex");
    logger.warn(
      "SESSION_SECRET not set — generated an ephemeral secret for this development run only. " +
        "Sessions will be invalidated on every restart. Set SESSION_SECRET in .env before deploying."
    );
  } else if (SESSION_SECRET.length < 32) {
    if (isProd) {
      throw new Error("SESSION_SECRET is too short. Use at least 32 random characters.");
    }
    logger.warn("SESSION_SECRET is shorter than recommended (32+ chars). Fine for local dev, not for production.");
  }

  const PORT = parseInt(process.env.PORT, 10) || 3000;
  const TRUST_PROXY = process.env.TRUST_PROXY === "true" || process.env.TRUST_PROXY === "1";
  const COOKIE_SECURE = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : isProd;

  if (isProd && !TRUST_PROXY) {
    logger.warn(
      "NODE_ENV=production but TRUST_PROXY is not set to true. If this server sits behind " +
        "a reverse proxy (nginx/Caddy/etc. terminating HTTPS), set TRUST_PROXY=true so secure " +
        "cookies and rate limiting see the real client IP/protocol."
    );
  }

  return { NODE_ENV, isProd, SESSION_SECRET, PORT, TRUST_PROXY, COOKIE_SECURE };
}

module.exports = { loadConfig };
