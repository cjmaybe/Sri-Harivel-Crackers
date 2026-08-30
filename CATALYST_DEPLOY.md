# Deploying Sri Harivel Crackers to Zoho Catalyst (AppSail)

This app is a Node.js/Express server (not a static site), so it must be hosted on
**Catalyst AppSail** — Catalyst's PaaS for full server apps — not the plain static
"Client" hosting component. AppSail natively supports Node.js.

## 1. Prerequisites

```bash
npm install -g zcatalyst-cli
catalyst login
```

You'll also need a Catalyst project created at https://catalyst.zoho.com (Console →
Create Project).

## 2. Initialize AppSail in this folder

From the root of this project (where `server.js` and `package.json` live):

```bash
catalyst init
```

- Associate it with the Catalyst project you created.
- Select **AppSail** as the component to initialize.
- Runtime/stack: **Node.js** (latest available).
- Build path: `.` (this current directory).

This generates `app-config.json` and `catalyst.json` for you (an `app-config.json`
is already included in this project as a reference/starting point — the CLI will
ask you the same questions and may regenerate it; just make sure the values match
what's below).

## 3. Port binding — already handled

Catalyst AppSail assigns its own port at runtime via the environment variable
`X_ZOHO_CATALYST_LISTEN_PORT`. This project's `lib/env.js` already reads that
variable first (falling back to `PORT`, then `3000` for local dev), so no code
change is needed here.

## 4. Required environment variables

Set these as AppSail environment variables (CLI prompts for them during init/deploy,
or set them later from Console → AppSail → your service → Environment Variables):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` (AppSail terminates HTTPS in front of your app) |
| `SESSION_SECRET` | a long random string — generate with `npm run gen-secret` |
| `COOKIE_SECURE` | `true` |

Never commit real secrets to `app-config.json` in source control — set them in the
Catalyst console/CLI instead and treat the checked-in file as a template.

## 5. Startup command

`app-config.json`'s `command` is already set to `npm start`, which runs
`node server.js`.

## 6. ⚠️ Important: the database and uploaded images are files on disk

This app uses `node:sqlite` writing to `data/shop.db`, and product images uploaded
via the admin panel are saved to `public/uploads/`. AppSail instances are managed
containers — local disk **is not guaranteed to persist** across redeploys, restarts,
or if your service scales to multiple instances (writes on one instance won't be
seen by another).

For a genuinely production-safe deployment on Catalyst, do one of:
- **Simplest / lowest-risk for a single-instance shop**: keep AppSail scaled to a
  single instance, and set up the included `npm run backup` script (see
  `scripts/backup-db.js`) as a scheduled job that pushes `data/shop.db` and
  `public/uploads/` to external storage (e.g. Zoho WorkDrive, S3, Catalyst's own
  Data Store/File Store) regularly.
- **More robust**: migrate product/order storage to Catalyst's managed **Data
  Store** and uploaded images to Catalyst **File Store**, so state lives outside
  the container entirely. This requires code changes in `db.js` and the upload
  handler in `server.js` — say the word if you'd like me to do this migration.

I did not change the storage layer myself since it's a real architectural decision
(cost/complexity vs. simplicity) — flagging it here so it isn't a silent surprise
after go-live.

## 7. Deploy

```bash
catalyst deploy
```

Or, for updates after the first deploy, from the AppSail section you can trigger a
new deployment from Console, or re-run `catalyst deploy`.

## 8. Custom domain (optional)

Console → AppSail → your service → Domains → add your domain (e.g.
`sriharivelcrackers.com`) and follow the CNAME instructions, then Catalyst manages
the SSL certificate for you automatically.

## 9. First admin login

After first deploy, the seed script creates the initial admin account — check
`README.md` / `db.js` for the seeding command and default credentials, and change
the admin password immediately after first login (Admin panel → change password).

---
Reference docs used for this guide: https://docs.catalyst.zoho.com/en/serverless/help/appsail/
