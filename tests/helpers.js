const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

/**
 * Call this at the very top of a test file, before requiring '../server'.
 * Gives each test file its own throwaway SQLite database and known,
 * policy-compliant admin credentials so tests are isolated and deterministic.
 */
function setupTestEnv() {
  const dbPath = path.join(os.tmpdir(), `jc-test-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.db`);
  process.env.NODE_ENV = "test";
  process.env.DB_PATH = dbPath;
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "Test-Passw0rd!99";
  process.env.LOG_LEVEL = "error";
  process.env.TRUST_PROXY = "false";
  return {
    dbPath,
    adminUsername: "admin",
    adminPassword: "Test-Passw0rd!99",
    cleanup: () => {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) {
        const p = dbPath + suffix;
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  };
}

module.exports = { setupTestEnv };
