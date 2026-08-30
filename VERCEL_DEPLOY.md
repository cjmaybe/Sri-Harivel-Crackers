# Deploying Sri Harivel Crackers to Vercel

## 1. Zero-config deploy — already set up

Vercel auto-detects an Express app when it finds `module.exports = app` (or
`app.listen`) in `server.js` at the project root — this project already has both
(guarded so `app.listen` only runs locally, not when Vercel imports the module).
So deployment itself needs no extra wiring:

```bash
npm install -g vercel
vercel login
vercel        # first deploy, follow the prompts
vercel --prod # promote to production
```

Or connect the GitHub repo at https://vercel.com/new and it will deploy on every push.

Your whole Express app becomes a single Vercel Function (Fluid compute), and
everything under `public/**` (the storefront HTML/CSS/JS, admin panel, product
images you shipped in the repo) is served directly from Vercel's CDN — `app.use(express.static(...))`
in `server.js` is simply ignored for those files on Vercel, which is fine, it's already
redundant with the CDN.

## 2. Security headers for the CDN-served static pages

Because `public/index.html` and `public/admin/index.html` are served straight from
the CDN (bypassing the Express function and therefore bypassing Helmet), I added
`vercel.json` with a `headers` block that mirrors the same Content-Security-Policy,
`X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options` Helmet already
sets in `server.js`. **If you change the CSP in `server.js` later (e.g. adding a new
external image host), update `vercel.json` to match** — the two are not linked, and
letting them drift means the static pages and the API responses would enforce
different policies.

## 3. ⚠️ Critical: the database and uploaded images will NOT persist

This is more restrictive than a typical host — **Vercel Functions have a read-only
filesystem, with only `/tmp` writable, capped at 500MB and wiped on every cold
start.** This app was built around `node:sqlite` writing to a local file
(`data/shop.db`) and product photos uploaded via the admin panel being saved to
`public/uploads/`. On Vercel:

- I pointed both at `/tmp` automatically when `process.env.VERCEL` is set (`db.js`
  and `server.js`), so the app **will not crash** — it boots, re-seeds the 242-item
  catalog from `data/seed-products.json` on each cold start, and lets image uploads
  work within a single warm instance.
- But: any admin change — editing a product, uploading a new photo, updating an
  order's status, changing settings — **only lives as long as that one warm
  function instance does.** A cold start (traffic goes quiet, then a new request
  arrives), a redeploy, or simply a second concurrent request landing on a different
  instance will not see those changes, and can silently lose them. This is not
  "slower" or "riskier" — it means **the admin panel is not safely usable for real
  order/product management in this configuration.**

### The real fix (recommended before you rely on the admin panel in production)

Move persistent state off the function's local disk entirely:

1. **Database** → [Vercel Postgres (powered by Neon)](https://vercel.com/marketplace/neon)
   — add it from your Vercel project's Storage tab, then rewrite `db.js` to use a
   Postgres client (`@neondatabase/serverless` or `pg`) instead of `node:sqlite`.
   The schema and queries in `db.js` are plain SQL, so the migration is mechanical,
   not a redesign — but it does touch every query in that file.
2. **Uploaded images** → [Vercel Blob](https://vercel.com/docs/storage/vercel-blob)
   — swap the `multer.diskStorage` destination in `server.js` for a Blob upload,
   and store the returned Blob URL in the product record instead of a local path.

I didn't do this migration in this pass since it's a genuine architectural change
(new dependency, schema/query rewrite, env vars for the DB connection string) rather
than a styling or config change — happy to do it next if you want the admin panel to
be production-safe on Vercel. Until then, treat the live Vercel deployment as a
**front-of-house demo/preview** of the storefront design, not the system you manage
real orders through — keep doing that via the Catalyst/AppSail or traditional-host
deployment (see `CATALYST_DEPLOY.md`) where the filesystem is persistent, or ask me
to wire up Postgres + Blob.

## 4. Environment variables

Set these in the Vercel project's Settings → Environment Variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |
| `SESSION_SECRET` | a long random string (admin login uses a signed cookie session, not a server-side store, so this is the only session-related var you need) |
| `COOKIE_SECURE` | `true` |

## 5. Custom domain

Project → Settings → Domains → add `sriharivelcrackers.com` (or whichever you own)
and follow Vercel's DNS instructions; SSL is automatic.
