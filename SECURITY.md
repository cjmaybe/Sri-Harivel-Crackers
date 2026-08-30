# Security Audit & Hardening Report — Sri Harivel Crackers Shop

**Scope:** full codebase (`server.js`, `db.js`, `public/`, `public/admin/`).
**Not claimed:** 100% security. No audit of this depth on a hand-built app can
promise that — see **"Remaining risks"** at the end for what's genuinely still
open, and re-read it before going live.

---

## Summary of what changed

| Area | Before | After |
|---|---|---|
| Admin credentials | Hardcoded default `admin` / `changeme123` fallback | No defaults. Weak `ADMIN_PASSWORD` refuses to boot; blank generates a strong random one, shown once |
| Session secret | No `SESSION_SECRET` handling | Required (32+ chars) in production; refuses to boot without it |
| Price calculation | Client sent `price`/`total`, server trusted it | Server looks up every item by ID and recomputes price/total from the DB; client values are ignored |
| CSRF | None | Double-submit cookie token required on every state-changing request |
| Rate limiting | None | Per-route limits: login (10/15min/IP + 5-attempt account lockout), orders (15/10min/IP), uploads (40/15min/IP), general API (300/15min/IP) |
| Input validation | Minimal/none | `express-validator` rules on every endpoint (type, length, range) |
| XSS | Front end already escaped output correctly, **except** `esc()` didn't escape `'`, which single-quoted attributes relied on | Fixed `esc()` in both `script.js` and `admin.js`; added server-side tag-stripping on all stored text as defense-in-depth |
| SQL injection | Already using parameterized queries everywhere | Unchanged (it was already correct) — verified with an injection-payload test |
| File uploads | Extension + `Content-Type` header only (both spoofable) | Same allow-list checks, **plus** magic-byte signature verification on the saved file; mismatches are deleted and rejected |
| Security headers | None | Helmet: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, HSTS, no `X-Powered-By`, etc. |
| Cookies | Default cookie-session config | `httpOnly`, `sameSite: lax`, `secure` in production, 12h expiry |
| Error handling | Errors could leak stack traces | Centralized handler; stack traces logged server-side only, generic messages to clients |
| Logging | `console.log` only | Structured JSON logs via `lib/logger.js`, request IDs on every request/response |
| Health checks | None | `GET /health`, `GET /health/db` |
| Password policy | None | 10+ chars, upper/lower/number/symbol, common-password check; enforced on admin creation and password change |
| Tests | None | 38 automated tests (jest + supertest) covering all of the above |
| Backups | None | `npm run backup` — consistent SQLite snapshot via `VACUUM INTO`, safe to run live |

---

## Detailed findings

### 1. Server-side price calculation (was: **Critical**)
The original `/api/orders` endpoint stored whatever `price`/`total` the
client's JavaScript sent. Anyone could open dev tools, edit the request body,
and record a ₹1 order for anything in the catalog. **Fixed:** the server now
looks up every cart item by ID in the database and computes price × quantity
itself; the client's price/name/total fields are read but never trusted.
Verified with a test that sends `price: 1` for a product that actually costs
₹8 and confirms the stored total is correct.

### 2. No CSRF protection (was: **High**)
All admin mutations (add/edit/delete products, change settings, place orders)
had no CSRF defense — a malicious page could have driven a logged-in admin's
browser to silently modify the shop. **Fixed:** double-submit-cookie CSRF
tokens (`middleware/csrf.js`), required on every non-GET `/api/*` request.

### 3. Default/hardcoded admin credentials (was: **Critical**)
`admin` / `changeme123` shipped as the fallback if `.env` wasn't edited —
easy to miss, and a known default is as good as no password. **Fixed:** no
default exists anymore. A missing `ADMIN_PASSWORD` triggers a random
20-character password generated and printed once; a weak one supplied by the
operator causes the server to refuse to start.

### 4. Stored XSS via single-quote attribute breakout (was: **High**)
Both front ends' `esc()` helper escaped `&`, `<`, `>`, `"` — but not `'`. Some
DOM strings use single-quoted attributes (e.g. `src='...'`), so a crafted
product image URL like `x' onerror='alert(1)` would have broken out of the
attribute and executed script in an admin's browser. **Fixed** in both
`public/script.js` and `public/admin/admin.js`; also added server-side
tag-stripping on all text fields as defense-in-depth, and URL-scheme
validation on image/link fields (rejects `javascript:`, `data:`, etc.).

### 5. No rate limiting / brute-force protection (was: **High**)
Login had no attempt limit — crackable by an unthrottled password-guessing
script. **Fixed:** IP-based rate limiting (`express-rate-limit`) plus a
DB-backed per-account lockout (5 failed attempts → 15-minute lock, survives
server restarts because it's stored in SQLite, not memory).

### 6. Spoofable file uploads (was: **Medium**)
Upload validation checked only the file extension and the client-supplied
`Content-Type` header — both are trivially spoofed by an attacker (e.g.
renaming a script to `.jpg` and setting `Content-Type: image/jpeg` in the
request). **Fixed:** after upload, the actual file bytes are checked against
known image magic numbers (JPEG/PNG/GIF/WEBP); anything else is deleted and
rejected, regardless of what extension/mimetype it claimed. SVG is
deliberately excluded from the allow-list (SVGs can carry `<script>`).

### 7. No input validation (was: **Medium**)
Most endpoints accepted whatever shape of JSON was sent — missing fields,
wrong types, unbounded string lengths, negative prices, arbitrary settings
keys. **Fixed:** `express-validator` rules on every endpoint; unknown settings
keys are rejected outright rather than silently stored.

### 8. Missing security headers (was: **Medium**)
No CSP, no `X-Content-Type-Options`, no clickjacking protection, `X-Powered-By`
leaking the framework. **Fixed:** Helmet with a CSP scoped to `'self'` (plus
`https:` for the shop's existing external product images), `frame-ancestors
'none'`, `nosniff`, HSTS. Required removing the one inline `style="..."`
attribute in `admin/index.html` (replaced with a CSS class) so the strict CSP
wouldn't need `'unsafe-inline'`.

### 9. Error handling / information disclosure (was: **Low-Medium**)
Unhandled errors could leak stack traces or internal paths to the client.
**Fixed:** centralized error handler; full details go to server-side
structured logs only, clients get a generic message plus a request ID they
can quote when reporting an issue.

### 10. SQL injection — **already safe, verified**
Every query in the original code used parameterized statements (`?`
placeholders), including in the rewritten `db.js`/`server.js`. No string
concatenation into SQL was found anywhere. Confirmed with a test sending
`admin' OR '1'='1` as a username — it's treated as a literal string and just
fails to match, as expected.

---

## What's covered by automated tests (`npm test`, 38 tests)
Auth (success/failure/generic-error/lockout), CSRF enforcement, requireAuth
gating, SQL-injection resistance, product/category CRUD + validation, stored
XSS stripping, malicious URL rejection, order price-tampering resistance,
order validation, upload signature validation (both a plain fake file and a
file disguised with a spoofed extension+mimetype), settings key allow-listing,
password policy enforcement, security headers, health checks.

Run it yourself: `npm test`.

---

## Remaining risks — please read before going live

This app is meaningfully harder to attack than it was, but it is **not**
audited to the level of a payment-handling or multi-tenant system, and some
things are explicitly out of scope for what was fixed here:

1. **Single shared admin account, no 2FA.** There's one admin login with no
   multi-factor option. If that password leaks, the attacker has full access
   to products/orders/settings. Rotate it periodically and don't share it
   over insecure channels.
2. **Session cookie has no server-side revocation.** `cookie-session` stores
   session data in a signed cookie, not a server-side store — so there's no
   way to force-invalidate a single active session (e.g. "log out this
   device remotely") short of rotating `SESSION_SECRET`, which logs
   *everyone* out. Acceptable for a single-admin app; would need a real
   session store (Redis, etc.) for a multi-admin setup.
3. **No 2FA / anomaly detection on login**, beyond the rate limit + lockout.
   A sufficiently patient, distributed attacker (many IPs, slow rate) is not
   fully stopped by IP-based rate limiting alone — the account lockout
   mitigates this but a coordinated attack could still cause a
   denial-of-service against the legitimate admin by repeatedly triggering
   lockouts.
4. **SQLite + `node:sqlite` is still an experimental Node API.** It works
   well in testing here, but Node's own docs mark it experimental and it
   could change in a future Node release. Pin your Node version in
   production and re-test before upgrading Node.
5. **CSP allows `img-src https:`** (any HTTPS origin), because the shop's
   product catalog genuinely references images on an external domain
   (`jallikattucrackers.in`). This is intentionally permissive for images
   only — script/style/connect are all locked to `'self'`— but it does mean
   a compromised or malicious external image host could serve content into
   `<img>` tags. Low practical risk (images can't execute script), but worth
   knowing.
6. **No WAF / DDoS protection at the application layer.** Rate limiting here
   protects against basic abuse but is not a substitute for a CDN/WAF (e.g.
   Cloudflare) in front of the app for real production traffic.
7. **File uploads are served directly by Express**, not from a separate
   static host/CDN or object storage. Fine at this scale; if traffic grows,
   move uploads to S3/Cloud Storage + a CDN both for performance and to keep
   user-supplied files further away from the app server.
8. **No dependency-vulnerability monitoring configured.** `npm audit`
   currently reports 0 vulnerabilities, but that's a snapshot — set up
   Dependabot/`npm audit` in CI (see `DEPLOYMENT.md`) so new CVEs in
   dependencies get caught automatically.
9. **This audit did not include a full manual penetration test** (e.g.
   timing attacks, advanced session-fixation scenarios, business-logic
   abuse beyond what's tested above). For a shop handling real customer
   data at scale, an independent third-party pentest before/after launch is
   worth budgeting for.

If you find something not covered here, please treat it seriously — this
report describes what was checked and fixed, not a guarantee of
invulnerability.
