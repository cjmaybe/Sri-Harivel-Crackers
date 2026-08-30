require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cookieSession = require("cookie-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");

const { loadConfig } = require("./lib/env");
const logger = require("./lib/logger");
const { cleanText, cleanUrl, isValidPhone } = require("./lib/sanitize");
const { detectImageType, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES } = require("./lib/fileSignature");
const { validatePasswordStrength } = require("./lib/passwordPolicy");

const requestId = require("./middleware/requestId");
const { attachCsrfToken, verifyCsrfToken } = require("./middleware/csrf");
const { apiLimiter, loginLimiter, orderLimiter, uploadLimiter } = require("./middleware/rateLimiters");
const { asyncHandler, notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const {
  loginValidators,
  changePasswordValidators,
  productValidators,
  productIdValidators,
  categoryValidators,
  categoryIdValidators,
  orderValidators,
  orderIdValidators,
  orderStatusValidators,
  settingsValidators
} = require("./middleware/validators");

// Fail fast on insecure/missing configuration before touching the DB.
const config = loadConfig();

const db = require("./db");

const app = express();
app.disable("x-powered-by");
if (config.TRUST_PROXY) app.set("trust proxy", 1);

// ---------- request tracing & logging ----------
app.use(requestId);
morgan.token("id", (req) => req.id);
app.use(
  morgan(':id :method :url :status :res[content-length]B - :response-time ms', {
    stream: { write: (line) => logger.info(line.trim()) },
    skip: (req) => req.path === "/health"
  })
);

// ---------- security headers ----------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameSrc: ["'self'", "https://www.google.com"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false, // product images may be hosted on a remote CDN without CORP headers
    referrerPolicy: { policy: "no-referrer" }
  })
);

app.use(compression());
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.use(
  cookieSession({
    name: "jc_admin_session",
    secret: config.SESSION_SECRET,
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    httpOnly: true,
    sameSite: "lax",
    secure: config.COOKIE_SECURE
  })
);

app.use(attachCsrfToken);

// ---------- static files ----------
const staticOpts = { maxAge: config.isProd ? "1d" : 0, etag: true };
app.use(express.static(path.join(__dirname, "public"), staticOpts));

const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use(
  "/uploads",
  express.static(uploadDir, {
    ...staticOpts,
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff")
  })
);

// ---------- health checks ----------
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get("/health/db", (req, res) => {
  try {
    db.prepare("SELECT 1 AS ok").get();
    res.json({ status: "ok" });
  } catch (err) {
    logger.error("Database health check failed", { requestId: req.id, message: err.message });
    res.status(503).json({ status: "error" });
  }
});

// ---------- CSRF token endpoint (used by both public & admin front ends) ----------
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken });
});

// ---------- rate limiting + CSRF verification for the rest of the API ----------
app.use("/api", apiLimiter);
app.use("/api", verifyCsrfToken);

// ---------- image upload (multer: extension + mimetype allow-list) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ".jpg";
    cb(null, "p" + Date.now() + "-" + crypto.randomBytes(8).toString("hex") + safeExt);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, GIF, or WEBP images are allowed"));
    }
    cb(null, true);
  }
});

// ---------- auth helpers ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

function getSettingsObj() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const obj = {};
  rows.forEach((r) => (obj[r.key] = r.value));
  return obj;
}

function ensureCategory(name) {
  db.prepare("INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, 999)").run(name);
}

// =====================================================
// AUTH
// =====================================================
app.post(
  "/api/admin/login",
  loginLimiter,
  loginValidators,
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(username);

    // Generic error message regardless of whether the username exists, to
    // avoid leaking which usernames are valid (user enumeration).
    const genericError = { error: "Invalid username or password" };

    if (!admin) return res.status(401).json(genericError);

    if (db.isAccountLocked(admin)) {
      logger.warn("Login blocked: account locked", { requestId: req.id, username });
      return res.status(423).json({ error: "Account temporarily locked due to repeated failed logins. Try again later." });
    }

    const passwordOk = bcrypt.compareSync(password, admin.password_hash);
    if (!passwordOk) {
      const { attempts, lockedUntil } = db.recordFailedLogin(admin);
      logger.warn("Failed login attempt", { requestId: req.id, username, attempts, lockedUntil });
      return res.status(401).json(genericError);
    }

    db.resetFailedLogins(admin.id);
    req.session.adminId = admin.id;
    req.session.username = admin.username;
    logger.info("Admin login succeeded", { requestId: req.id, username });
    res.json({ ok: true, username: admin.username });
  })
);

app.post("/api/admin/logout", (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({ loggedIn: true, username: req.session.username });
  }
  res.json({ loggedIn: false });
});

app.post(
  "/api/admin/change-password",
  requireAuth,
  changePasswordValidators,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.session.adminId);
    if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    const check = validatePasswordStrength(newPassword);
    if (!check.valid) {
      return res.status(400).json({ error: check.errors[0], details: check.errors });
    }
    if (bcrypt.compareSync(newPassword, admin.password_hash)) {
      return res.status(400).json({ error: "New password must be different from the current password" });
    }
    const hash = bcrypt.hashSync(newPassword, 12);
    db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(hash, admin.id);
    logger.info("Admin password changed", { requestId: req.id, adminId: admin.id });
    res.json({ ok: true });
  })
);

// =====================================================
// PUBLIC: settings / categories / products
// =====================================================
app.get("/api/settings", (req, res) => {
  res.json(getSettingsObj());
});

app.get("/api/categories", (req, res) => {
  const rows = db.prepare("SELECT name FROM categories ORDER BY sort_order ASC, name ASC").all();
  res.json(rows.map((r) => r.name));
});

app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY id ASC").all();
  res.json(
    rows.map((p) => ({
      id: String(p.id),
      cat: p.category,
      name: p.name,
      pack: p.pack,
      img: p.img,
      price: p.price,
      orig: p.orig
    }))
  );
});

// =====================================================
// PUBLIC: place order
// Prices/totals are ALWAYS recomputed server-side from the database — the
// client-submitted price/name/total values are never trusted, so a modified
// front end or direct API call cannot under-charge or forge an order total.
// =====================================================
app.post(
  "/api/orders",
  orderLimiter,
  orderValidators,
  asyncHandler(async (req, res) => {
    const { custName, custMobile, custAddress, items } = req.body;

    if (custMobile && !isValidPhone(custMobile)) {
      return res.status(400).json({ error: "Please enter a valid mobile number" });
    }

    const ids = items.map((it) => Number(it.id));
    const products = db
      .prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => "?").join(",")}) AND active = 1`)
      .all(...ids);
    const productById = new Map(products.map((p) => [p.id, p]));

    const verifiedItems = [];
    for (const it of items) {
      const product = productById.get(Number(it.id));
      if (!product) {
        return res.status(400).json({ error: `Item ${it.id} is no longer available. Please refresh your cart.` });
      }
      const qty = Math.max(1, Math.min(999, Math.round(Number(it.qty))));
      verifiedItems.push({
        id: product.id,
        name: product.name,
        pack: product.pack,
        price: product.price, // server-verified price, client value ignored
        qty
      });
    }

    const total = verifiedItems.reduce((sum, it) => sum + it.price * it.qty, 0);

    const stmt = db.prepare(
      "INSERT INTO orders (cust_name, cust_mobile, cust_address, items_json, total, status) VALUES (?, ?, ?, ?, ?, 'new')"
    );
    const info = stmt.run(
      cleanText(custName, 100),
      cleanText(custMobile, 30),
      cleanText(custAddress, 500),
      JSON.stringify(verifiedItems),
      total
    );
    logger.info("Order placed", { requestId: req.id, orderId: info.lastInsertRowid, total, itemCount: verifiedItems.length });
    res.json({ ok: true, orderId: info.lastInsertRowid, total });
  })
);

// =====================================================
// ADMIN: products CRUD
// =====================================================
app.get("/api/admin/products", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM products ORDER BY id DESC").all();
  res.json(rows);
});

app.post(
  "/api/admin/products",
  requireAuth,
  productValidators,
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body.name, 200);
    const category = cleanText(req.body.category, 100);
    const pack = cleanText(req.body.pack, 100);
    const img = cleanUrl(req.body.img, 500);
    const price = Math.round(Number(req.body.price));
    const orig = Math.round(Number(req.body.orig));
    const active = req.body.active === false ? 0 : 1;

    const info = db
      .prepare("INSERT INTO products (name, category, pack, img, price, orig, active) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(name, category, pack, img, price, orig, active);
    ensureCategory(category);
    res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(info.lastInsertRowid));
  })
);

app.put(
  "/api/admin/products/:id",
  requireAuth,
  productIdValidators,
  productValidators,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Product not found" });

    const name = cleanText(req.body.name, 200);
    const category = cleanText(req.body.category, 100);
    const pack = cleanText(req.body.pack, 100);
    const img = cleanUrl(req.body.img, 500);
    const price = Math.round(Number(req.body.price));
    const orig = Math.round(Number(req.body.orig));
    const active = req.body.active === undefined ? existing.active : req.body.active ? 1 : 0;

    db.prepare("UPDATE products SET name=?, category=?, pack=?, img=?, price=?, orig=?, active=? WHERE id=?").run(
      name,
      category,
      pack,
      img,
      price,
      orig,
      active,
      id
    );
    ensureCategory(category);
    res.json(db.prepare("SELECT * FROM products WHERE id = ?").get(id));
  })
);

app.delete("/api/admin/products/:id", requireAuth, productIdValidators, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  res.json({ ok: true });
});

// =====================================================
// ADMIN: categories CRUD
// =====================================================
app.get("/api/admin/categories", requireAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY sort_order ASC, name ASC").all());
});

app.post("/api/admin/categories", requireAuth, categoryValidators, (req, res) => {
  const name = cleanText(req.body.name, 100);
  if (!name) return res.status(400).json({ error: "name is required" });
  try {
    const info = db.prepare("INSERT INTO categories (name, sort_order) VALUES (?, 999)").run(name);
    res.json({ id: info.lastInsertRowid, name });
  } catch {
    res.status(400).json({ error: "Category already exists" });
  }
});

app.put("/api/admin/categories/:id", requireAuth, categoryIdValidators, categoryValidators, (req, res) => {
  const id = Number(req.params.id);
  const name = cleanText(req.body.name, 100);
  const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (!cat) return res.status(404).json({ error: "Category not found" });
  if (!name) return res.status(400).json({ error: "name is required" });
  const tx = db.transaction(() => {
    db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, id);
    db.prepare("UPDATE products SET category = ? WHERE category = ?").run(name, cat.name);
  });
  tx();
  res.json({ ok: true });
});

app.delete("/api/admin/categories/:id", requireAuth, categoryIdValidators, (req, res) => {
  const id = Number(req.params.id);
  const cat = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
  if (cat) {
    const inUse = db.prepare("SELECT COUNT(*) AS c FROM products WHERE category = ?").get(cat.name).c;
    if (inUse > 0) {
      return res.status(400).json({ error: `Cannot delete: ${inUse} product(s) use this category` });
    }
  }
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  res.json({ ok: true });
});

// =====================================================
// ADMIN: image upload
// =====================================================
app.post(
  "/api/admin/upload",
  requireAuth,
  uploadLimiter,
  (req, res, next) => upload.single("image")(req, res, next),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Verify the file's actual bytes match a known image signature —
    // extension/mimetype checks alone can be spoofed by a malicious client.
    const detected = detectImageType(req.file.path);
    if (!detected) {
      fs.unlink(req.file.path, () => {});
      logger.warn("Upload rejected: signature mismatch", { requestId: req.id, filename: req.file.filename });
      return res.status(400).json({ error: "File does not appear to be a valid image" });
    }

    res.json({ url: "/uploads/" + req.file.filename });
  })
);

// =====================================================
// ADMIN: orders
// =====================================================
app.get("/api/admin/orders", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  res.json(
    rows.map((o) => ({
      ...o,
      items: JSON.parse(o.items_json)
    }))
  );
});

app.put("/api/admin/orders/:id", requireAuth, orderStatusValidators, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  res.json({ ok: true });
});

app.delete("/api/admin/orders/:id", requireAuth, orderIdValidators, (req, res) => {
  db.prepare("DELETE FROM orders WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// =====================================================
// ADMIN: settings
// =====================================================
app.get("/api/admin/settings", requireAuth, (req, res) => {
  res.json(getSettingsObj());
});

const URL_SETTING_KEYS = new Set(["pricelist_url", "instagram_url", "youtube_url", "facebook_url"]);
const PHONE_SETTING_KEYS = new Set(["whatsapp_number", "whatsapp_number_2", "phone_1", "phone_2"]);

app.put("/api/admin/settings", requireAuth, settingsValidators, (req, res) => {
  const body = req.body;
  const cleaned = {};
  for (const [key, rawValue] of Object.entries(body)) {
    if (URL_SETTING_KEYS.has(key)) {
      cleaned[key] = cleanUrl(rawValue, 500);
    } else if (PHONE_SETTING_KEYS.has(key)) {
      const str = String(rawValue).trim();
      if (str && !isValidPhone(str)) {
        return res.status(400).json({ error: `${key} is not a valid phone number` });
      }
      cleaned[key] = cleanText(str, 30);
    } else {
      cleaned[key] = cleanText(rawValue, 500);
    }
  }

  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) upsert.run(k, String(v));
  });
  tx(Object.entries(cleaned));
  res.json(getSettingsObj());
});

// =====================================================
// ADMIN: dashboard stats
// =====================================================
app.get("/api/admin/stats", requireAuth, (req, res) => {
  const totalProducts = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
  const totalOrders = db.prepare("SELECT COUNT(*) AS c FROM orders").get().c;
  const newOrders = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'new'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE status != 'cancelled'").get().s;
  res.json({ totalProducts, totalOrders, newOrders, revenue });
});

// ---------- SPA fallbacks ----------
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin", "index.html")));
app.get("/admin/*", (req, res) => res.sendFile(path.join(__dirname, "public", "admin", "index.html")));

// ---------- 404 + centralized error handling ----------
app.use("/api", notFoundHandler);
app.use(errorHandler);

// ---------- start server ----------
/* istanbul ignore next */
if (require.main === module) {
  const server = app.listen(config.PORT, () => {
    logger.info("Server started", { port: config.PORT, env: config.NODE_ENV });
    console.log(`Sri Harivel Crackers server running at http://localhost:${config.PORT}`);
    console.log(`Admin panel at http://localhost:${config.PORT}/admin`);
  });

  const shutdown = (signal) => {
    logger.info("Shutting down", { signal });
    server.close(() => {
      logger.info("Server closed cleanly");
      process.exit(0);
    });
    // Force-exit if connections don't close in time.
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", { message: reason && reason.message, stack: reason && reason.stack });
  });
  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = app;
