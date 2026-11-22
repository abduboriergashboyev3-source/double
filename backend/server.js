
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

app.use(express.json({ limit: "20kb" }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const FRONTEND_URL = process.env.FRONTEND_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !process.env.DATABASE_URL || !FRONTEND_URL) {
  throw new Error("Missing required environment variables");
}

app.use(cors({
  origin: FRONTEND_URL.split(",").map(x => x.trim()),
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false"
    ? false
    : { rejectUnauthorized: false }
});

// DATABASE
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_seen TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admins (
      telegram_id TEXT PRIMARY KEY,
      added_at TIMESTAMPTZ DEFAULT NOW(),
      added_by TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      telegram_id TEXT NOT NULL,
      service TEXT NOT NULL,
      package TEXT NOT NULL,
      target TEXT NOT NULL,
      amount BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_logs (
      id BIGSERIAL PRIMARY KEY,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Boshlang'ich administratorlar
  const ids = (process.env.ADMIN_IDS || "")
    .split(",")
    .map(x => x.trim())
    .filter(x => /^\d+$/.test(x));

  for (const id of ids) {
    await pool.query(
      `INSERT INTO admins (telegram_id)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [id]
    );
  }

  console.log("Database ready");
}

// TELEGRAM INIT DATA TEKSHIRISH
function verifyTelegram(initData) {
  if (!initData || typeof initData !== "string") {
    throw new Error("Telegram authorization required");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error("Invalid Telegram hash");
  }

  const authDate = Number(params.get("auth_date"));

  if (!Number.isFinite(authDate)) {
    throw new Error("Invalid auth date");
  }

  const age = Math.floor(Date.now() / 1000) - authDate;

  if (age < -60 || age > 3600) {
    throw new Error("Telegram session expired");
  }

  const entries = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));

  const dataCheckString = entries
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest();

  const receivedHash = Buffer.from(hash, "hex");

  if (
    calculatedHash.length !== receivedHash.length ||
    !crypto.timingSafeEqual(calculatedHash, receivedHash)
  ) {
    throw new Error("Telegram verification failed");
  }

  const rawUser = params.get("user");

  if (!rawUser) {
    throw new Error("User information missing");
  }

  const user = JSON.parse(rawUser);

  if (!user.id || !/^\d+$/.test(String(user.id))) {
    throw new Error("Invalid user");
  }

  return user;
}

// AUTH MIDDLEWARE
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";

    if (!header.startsWith("tma ")) {
      return res.status(401).json({
        error: "Telegram authentication required"
      });
    }

    const user = verifyTelegram(header.slice(4));

    req.user = {
      id: String(user.id),
      username: user.username || null,
      first_name: user.first_name || "",
      last_name: user.last_name || ""
    };

    await pool.query(`
      INSERT INTO users
        (telegram_id, username, first_name, last_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (telegram_id)
      DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        last_seen = NOW()
    `, [
      req.user.id,
      req.user.username,
      req.user.first_name,
      req.user.last_name
    ]);

    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    res.status(401).json({ error: "Unauthorized" });
  }
}

// ADMIN MIDDLEWARE
async function adminOnly(req, res, next) {
  try {
    const result = await pool.query(
      "SELECT 1 FROM admins WHERE telegram_id = $1",
      [req.user.id]
    );

    if (!result.rowCount) {
      return res.status(403).json({
        error: "Admin access denied"
      });
    }

    next();
  } catch {
    res.status(500).json({ error: "Server error" });
  }
}

// ADMIN LOG
async function logAdmin(adminId, action, details = {}) {
  await pool.query(
    `INSERT INTO admin_logs (admin_id, action, details)
     VALUES ($1, $2, $3)`,
    [adminId, action, JSON.stringify(details)]
  );
}

// HEALTH
app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "DOUBLE DONATE" });
});

// CURRENT USER
app.get("/api/me", authenticate, async (req, res) => {
  const result = await pool.query(
    "SELECT 1 FROM admins WHERE telegram_id = $1",
    [req.user.id]
  );

  res.json({
    user: req.user,
    isAdmin: result.rowCount > 0
  });
});

// ADMIN STATS
app.get(
  "/api/admin/stats",
  authenticate,
  adminOnly,
  async (req, res) => {
    const users = await pool.query(
      "SELECT COUNT(*) FROM users"
    );

    const orders = await pool.query(
      "SELECT COUNT(*) FROM orders"
    );

    const pending = await pool.query(
      "SELECT COUNT(*) FROM orders WHERE status = 'pending'"
    );

    const admins = await pool.query(
      "SELECT COUNT(*) FROM admins"
    );

    res.json({
      users: Number(users.rows[0].count),
      orders: Number(orders.rows[0].count),
      pending: Number(pending.rows[0].count),
      admins: Number(admins.rows[0].count)
    });
  }
);

// USERS LIST
app.get(
  "/api/admin/users",
  authenticate,
  adminOnly,
  async (req, res) => {
    const result = await pool.query(`
      SELECT telegram_id, username, first_name,
             last_name, created_at, last_seen
      FROM users
      ORDER BY last_seen DESC
      LIMIT 200
    `);

    res.json({ users: result.rows });
  }
);

// ORDERS LIST
app.get(
  "/api/admin/orders",
  authenticate,
  adminOnly,
  async (req, res) => {
    const result = await pool.query(`
      SELECT * FROM orders
      ORDER BY created_at DESC
      LIMIT 200
    `);

    res.json({ orders: result.rows });
  }
);

// ADMINS LIST
app.get(
  "/api/admin/admins",
  authenticate,
  adminOnly,
  async (req, res) => {
    const result = await pool.query(`
      SELECT telegram_id, added_at, added_by
      FROM admins
      ORDER BY added_at ASC
    `);

    res.json({ admins: result.rows });
  }
);

// ADD ADMIN
app.post(
  "/api/admin/admins",
  authenticate,
  adminOnly,
  async (req, res) => {
    const id = String(req.body.telegramId || "");

    if (!/^\d{5,20}$/.test(id)) {
      return res.status(400).json({
        error: "Invalid Telegram ID"
      });
    }

    const result = await pool.query(`
      INSERT INTO admins (telegram_id, added_by)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING telegram_id
    `, [id, req.user.id]);

    if (!result.rowCount) {
      return res.status(409).json({
        error: "This user is already an admin"
      });
    }

    await logAdmin(req.user.id, "ADD_ADMIN", {
      telegramId: id
    });

    res.json({
      success: true,
      telegramId: id
    });
  }
);

// REMOVE ADMIN
app.delete(
  "/api/admin/admins/:id",
  authenticate,
  adminOnly,
  async (req, res) => {
    const id = req.params.id;

    if (!/^\d{5,20}$/.test(id)) {
      return res.status(400).json({
        error: "Invalid Telegram ID"
      });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        error: "You cannot remove yourself"
      });
    }

    const count = await pool.query(
      "SELECT COUNT(*) FROM admins"
    );

    if (Number(count.rows[0].count) <= 1) {
      return res.status(400).json({
        error: "Cannot remove the last admin"
      });
    }

    const result = await pool.query(
      "DELETE FROM admins WHERE telegram_id = $1 RETURNING telegram_id",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Admin not found"
      });
    }

    await logAdmin(req.user.id, "REMOVE_ADMIN", {
      telegramId: id
    });

    res.json({ success: true });
  }
);

// SERVER
async function start() {
  await initDB();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`DOUBLE DONATE API running on ${PORT}`);
  });
}

start().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});

