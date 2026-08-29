// Minimal structured logger. Writes JSON lines to stdout/stderr so it can be
// captured by any process manager or log collector (pm2, journald, Docker, etc.)
// No third-party dependency: keeps the dependency surface small.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;

function write(level, message, meta) {
  if (LEVELS[level] > currentLevel) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta && typeof meta === "object" ? meta : {})
  };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

module.exports = {
  error: (message, meta) => write("error", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  info: (message, meta) => write("info", message, meta),
  debug: (message, meta) => write("debug", message, meta)
};
