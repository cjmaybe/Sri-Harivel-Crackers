#!/usr/bin/env node
// Creates a consistent point-in-time backup of the SQLite database.
// Safe to run while the server is live: VACUUM INTO takes an internal
// read lock and writes a clean, defragmented snapshot to a new file —
// it does not block or get blocked by normal WAL-mode readers/writers.
//
// Usage:
//   node scripts/backup-db.js
//   node scripts/backup-db.js --keep 14   (delete backups older than 14, default 30)
//
// Recommended: run this on a schedule via cron / systemd timer / Task
// Scheduler, e.g. a nightly cron entry:
//   0 2 * * * cd /path/to/hari-shop && node scripts/backup-db.js >> logs/backup.log 2>&1

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "shop.db");
const BACKUP_DIR = path.join(path.dirname(DB_PATH), "backups");

function parseKeepArg() {
  const idx = process.argv.indexOf("--keep");
  if (idx !== -1 && process.argv[idx + 1]) return parseInt(process.argv[idx + 1], 10);
  return 30;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH} — nothing to back up.`);
    process.exit(1);
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `shop-${timestamp}.db`);

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  const sizeKb = (fs.statSync(backupPath).size / 1024).toFixed(1);
  console.log(`Backup written: ${backupPath} (${sizeKb} KB)`);

  const keepDays = parseKeepArg();
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    const fullPath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(fullPath);
    if (stat.isFile() && stat.mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
      console.log(`Removed old backup: ${file}`);
    }
  }
}

main();
