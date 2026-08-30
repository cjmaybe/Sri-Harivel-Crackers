# Sri Harivel Crackers — Full Website + Admin Panel

A complete, working cracker-shop website built on top of your original front end:

- **Public site** (`/`) — same look and feel as your uploaded design, but products,
  categories, WhatsApp numbers, minimum-order amounts and contact info are now
  loaded live from a database instead of being hard-coded in `script.js`.
- **Admin panel** (`/admin`) — a password-protected dashboard where you can:
  - Add / edit / delete products, with image upload
  - Manage categories (add, rename, delete)
  - View every order placed on the site (with items, customer name, mobile,
    address, total) and update its status (New → Confirmed → Delivered / Cancelled)
  - Edit shop settings: WhatsApp numbers, phone numbers, email, address,
    minimum order amounts, pricelist link, social links
  - Change the admin password
- **Ordering** still works exactly as before: a customer builds a cart and taps
  "Order on WhatsApp", which opens WhatsApp with the order pre-filled. The order
  is now **also saved to the database** first, so you have a permanent record of
  every enquiry in the admin panel — even if the customer never completes the
  WhatsApp message.

No online payment is involved anywhere, in line with the Supreme Court order
notice already on your site — this only adds order tracking and content
management behind the scenes.

## 1. Requirements

- [Node.js](https://nodejs.org) version 22.5 or later (uses Node's built-in
  `node:sqlite` — no native compilation, no Visual Studio / build tools needed).

## 2. Setup

```bash
cd hari-shop
npm install
cp .env.example .env
```

Open `.env` and set:

- `SESSION_SECRET` — **required**. Generate one with `npm run gen-secret` and
  paste the output in. There is no default — the server refuses to start in
  production without this, and uses a throwaway value (with a warning) for
  local development if you leave it blank.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — optional. If you leave `ADMIN_PASSWORD`
  blank, a strong random password is generated and printed to the console the
  first time the server starts — copy it down immediately, it's shown only
  once. If you set your own, it must be 10+ characters with upper/lower case,
  a number, and a symbol, or the server will refuse to start.

## 3. Run it

```bash
npm start
```

- Public website: **http://localhost:3000**
- Admin panel: **http://localhost:3000/admin**
- Health check: **http://localhost:3000/health**

The first time it runs, the server automatically:
- Creates a SQLite database at `data/shop.db`
- Seeds it with all 242 products and 39 categories from your original site
- Creates your admin account (see above for the password)

## 4. Using the admin panel

Log in at `/admin`. If you didn't set `ADMIN_PASSWORD` in `.env`, use the
auto-generated password printed to the console on first startup, then
immediately go to **My Account** and set your own.

- **Dashboard** — quick stats and the most recent orders.
- **Products** — search/filter, add a product (with an image upload or an image
  URL), edit prices, hide a product from the site without deleting it (uncheck
  "Active"), or delete it.
- **Categories** — add new categories, rename existing ones (this updates all
  products in that category automatically), or delete unused ones.
- **Orders** — every WhatsApp order placed on the site lands here automatically.
  Click the item count to see the full order, and use the status dropdown to
  mark it Confirmed / Delivered / Cancelled. Prices shown here are always the
  server-verified prices at the time the order was placed, not whatever the
  customer's browser happened to send.
- **Settings** — change WhatsApp numbers, phone numbers, email, address, the
  minimum-order thresholds, the pricelist PDF link, and your social links. These
  changes appear on the public site immediately (no redeploy needed).
- **My Account** — change your admin password (10+ chars, mixed case, number,
  symbol required).

To reset a forgotten admin password: stop the server, delete `data/shop.db`
(back it up first — see `npm run backup` — this also resets products/orders),
and restart with a new/blank `ADMIN_PASSWORD` in `.env`.

## 5. Testing

```bash
npm test
```

Runs the automated test suite (38 tests) covering auth, CSRF, brute-force
lockout, input validation, XSS/price-tampering defenses, file-upload signature
checks, and health endpoints. See `SECURITY.md` for the full audit writeup.

## 6. Deploying to production

See **`DEPLOYMENT.md`** for the full guide (reverse proxy / HTTPS, process
manager, environment variables, backups, monitoring). Short version:

1. Set `NODE_ENV=production`, a strong `SESSION_SECRET`, and `TRUST_PROXY=true`
   if you're behind a reverse proxy.
2. Put this app behind a TLS-terminating reverse proxy (nginx/Caddy) — it does
   not terminate HTTPS itself.
3. Run it with a process manager (pm2/systemd) so it restarts on crash/reboot.
4. Give it a **persistent disk** for `data/` and `public/uploads/` — both are
   regenerated as empty/seeded on a fresh disk, so back them up.
5. Schedule `npm run backup` (see `SECURITY.md` → Database backups).

## 7. Project structure

```
hari-shop/
  server.js            Express server + all API routes
  db.js                 SQLite schema, migrations, first-run seeding
  lib/                   Logger, password policy, sanitization, env validation
  middleware/             CSRF, rate limiting, validation, error handling
  tests/                   Automated test suite (jest + supertest)
  scripts/                 backup-db.js, gen-secret.js
  data/
    seed-products.json     Original 242 products (used only on first run)
    seed-categories.json   Original 39 categories (used only on first run)
    shop.db                 Created automatically — your live database
    backups/                 Created by `npm run backup`
  public/
    index.html          Public site
    styles.css            Public site styles (unchanged from your upload)
    script.js              Public site logic — fetches data from the API
    uploads/                 Product images uploaded from the admin panel
    admin/
      index.html            Admin panel shell (login + dashboard)
      admin.css              Admin panel styles
      admin.js                Admin panel logic
```

## 8. Notes

- Orders are never charged online — customers still confirm by WhatsApp/phone,
  exactly as your original site described. The admin panel simply gives you a
  searchable record of every order alongside the WhatsApp message, with
  prices always verified server-side.
- Product images can be uploaded directly (stored in `public/uploads/`, and
  verified by file signature, not just extension) or you can keep pasting an
  image URL — whichever you leave filled in last on the form wins.
- **Read `SECURITY.md` before going live** — it documents what's been hardened
  and what residual risks remain.

