# Deployment Guide — Sri Harivel Crackers Shop

## 1. Server requirements
- Node.js **22.5+** (needed for the built-in `node:sqlite` module — no native
  build tools required).
- A **persistent disk** for `data/` (the SQLite DB) and `public/uploads/`
  (uploaded product images). Most PaaS free tiers use ephemeral storage —
  confirm your host gives you a persistent volume, or these will be wiped on
  every redeploy/restart.

## 2. Environment variables
Copy `.env.example` to `.env` and set, at minimum:

```bash
NODE_ENV=production
PORT=3000
SESSION_SECRET=<output of `npm run gen-secret`>
TRUST_PROXY=true          # only if behind a reverse proxy (see below)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=            # leave blank for an auto-generated strong password,
                            # printed once on first boot — or set your own
                            # 10+ char / mixed-case / number / symbol password
LOG_LEVEL=info
```

The server **refuses to start** in production without a strong
`SESSION_SECRET`, and refuses to start if `ADMIN_PASSWORD` is set but doesn't
meet the password policy — this is intentional fail-fast behavior, not a bug.

## 3. Put it behind a reverse proxy (required for HTTPS)
This app does not terminate TLS itself. Run it behind nginx, Caddy, or your
cloud provider's load balancer, and have *that* handle the HTTPS certificate.

**Caddy example** (`Caddyfile`) — simplest option, automatic HTTPS:
```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

**nginx example:**
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}
```

Whichever you use, set `TRUST_PROXY=true` in `.env` so Express reads the
`X-Forwarded-*` headers correctly — this is required for secure cookies and
for rate limiting to see the real client IP instead of the proxy's IP.

## 4. Run it with a process manager
Don't run `npm start` directly in production — use something that restarts
the app on crash and on server reboot.

**pm2** (simplest):
```bash
npm install -g pm2
pm2 start server.js --name sri-harivel-shop
pm2 save
pm2 startup   # follow the printed instructions to enable on-boot start
```

**systemd** (`/etc/systemd/system/sri-harivel-shop.service`):
```ini
[Unit]
Description=Sri Harivel Crackers Shop
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/sri-harivel-shop/hari-shop
EnvironmentFile=/opt/sri-harivel-shop/hari-shop/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now sri-harivel-shop
```

## 5. Database backups
```bash
npm run backup
```
Writes a consistent snapshot to `data/backups/shop-<timestamp>.db` using
SQLite's `VACUUM INTO` (safe to run while the server is live) and prunes
backups older than 30 days (`npm run backup -- --keep 14` to change that).

Schedule it — a nightly cron entry is enough for a shop this size:
```
0 2 * * * cd /opt/sri-harivel-shop/hari-shop && node scripts/backup-db.js >> logs/backup.log 2>&1
```

**Also back up `public/uploads/`** (product images) — the backup script only
covers the database. A simple nightly `rsync`/`tar` of that directory to
off-server storage is enough.

**Restoring:** stop the server, replace `data/shop.db` with the desired
backup file (drop the `-shm`/`-wal` sidecar files if present), restart.

## 6. Health checks & monitoring
- `GET /health` — liveness (process is up).
- `GET /health/db` — readiness (database is reachable). Point your load
  balancer's / uptime monitor's health check here.
- Logs are structured JSON on stdout/stderr (`lib/logger.js`) — pipe them into
  whatever your platform collects (`journalctl`, Docker log driver, a log
  aggregator). Every request gets an `X-Request-Id` response header and a
  matching `requestId` field in its log lines, so you can trace a specific
  failed request end-to-end.

## 7. Keeping dependencies patched
```bash
npm audit                 # check for known vulnerabilities
npm outdated               # check for newer versions
```
Consider enabling GitHub's Dependabot (or equivalent) on the repository so
dependency CVEs are flagged automatically rather than relying on manually
remembering to run `npm audit`.

## 8. Performance notes
- `compression` middleware is enabled — responses are gzipped.
- Static assets (`public/`, `public/uploads/`) are served with a 1-day cache
  header in production (`NODE_ENV=production` — this is automatic, no config
  needed).
- Database indexes exist on `products(active)`, `products(category)`,
  `orders(status)`, and `orders(created_at)` for the query patterns this app
  actually uses.
- SQLite is running in WAL mode, which allows concurrent reads alongside
  writes — appropriate for this app's traffic level (a single small shop).
  If you ever need to scale beyond a single server instance, SQLite's
  single-file model won't support multiple app servers sharing one
  database — you'd need to migrate to Postgres/MySQL at that point.

## 9. Pre-launch checklist
- [ ] `.env` has a real `SESSION_SECRET` (not the `.env.example` placeholder)
- [ ] `NODE_ENV=production`
- [ ] `TRUST_PROXY=true` if behind a reverse proxy
- [ ] Admin password changed from whatever was auto-generated/set initially
- [ ] Reverse proxy configured with a valid TLS certificate
- [ ] `data/` and `public/uploads/` are on persistent storage
- [ ] `npm run backup` scheduled via cron/systemd timer
- [ ] `npm test` passes
- [ ] `npm audit` shows no unresolved vulnerabilities
- [ ] Read `SECURITY.md`, especially the "Remaining risks" section
