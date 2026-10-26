import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";

const app = express();

// The API is reached through the local Nginx reverse proxy. Binding to loopback
// prevents accidental direct exposure on the LAN or public interfaces.
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const JWT_SECRET = process.env.JWT_SECRET;


const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

type LoginAttempt = {
  attempts: number;
  resetAt: number;
};

const loginAttempts = new Map<string, LoginAttempt>();
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured");
}

app.use(cors());

app.use(express.json());

let db: Database;
function getLoginClientKey(req: express.Request) {
  // Express is reachable only through local Nginx. Cloudflare supplies this
  // header for Tunnel requests; Nginx supplies X-Real-IP for Tailscale/LAN.
  return req.get("cf-connecting-ip") || req.get("x-real-ip") || req.ip;
}

function isLoginRateLimited(key: string, now: number) {
  const attempt = loginAttempts.get(key);

  if (!attempt) {
    return false;
  }

  if (now >= attempt.resetAt) {
    loginAttempts.delete(key);
    return false;
  }

  return attempt.attempts >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(key: string, now: number) {
  const existing = loginAttempts.get(key);

  if (!existing || now >= existing.resetAt) {
    loginAttempts.set(key, {
      attempts: 1,
      resetAt: now + LOGIN_WINDOW_MS,
    });
    return;
  }

  existing.attempts += 1;
}


async function initializeDatabase() {
  db = await open({
    filename: "./camera.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.post("/api/mediamtx/auth", async (req, res) => {
  const {
    user,
    password,
    token,
    action,
    path,
    protocol,
    ip,
  } = req.body;

  console.log("MediaMTX auth request:", {
    user,
    action,
    path,
    protocol,
    ip,
    hasToken: !!token,
  });

  // --------------------------------------------------
  // Camera publisher
  // --------------------------------------------------
  //
  // FFmpeg runs locally on the Raspberry Pi and publishes
  // the USB camera to MediaMTX through RTSP.
  //
  // MediaMTX sends this as:
  //   action   = publish
  //   protocol = rtsp
  //   path     = camera
  //
  // Allow the local publisher.
  //
  if (
    action === "publish" &&
    protocol === "rtsp" &&
    path === "camera" &&
    (ip === "127.0.0.1" || ip === "::1")
  ) {
    return res.sendStatus(200);
  }

  // --------------------------------------------------
  // Browser WebRTC reader
  // --------------------------------------------------
  //
  // Browser must provide a valid JWT.
  //
  if (
    action !== "read" ||
    protocol !== "webrtc" ||
    path !== "camera"
  ) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  if (!token) {
    return res.status(401).json({
      message: "Missing token",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("userId" in decoded)
    ) {
      return res.status(401).json({
        message: "Invalid token",
      });
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("JWT verification failed:", error);

    return res.status(401).json({
      message: "Invalid token",
    });
  }
});


app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username ||
      !password
    ) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    const user = await db.get(
      `
      SELECT id, username, password_hash
      FROM users
      WHERE username = ?
      `,
      username
    );

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
      },
      JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});


async function startServer() {
  try {
    console.log("Opening SQLite database...");

    await initializeDatabase();

    console.log("SQLite database ready");

    app.listen(PORT, HOST, () => {
      console.log(
        `Camera API running on http://${HOST}:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Failed to start server:",
      error
    );

    process.exit(1);
  }
}

startServer();
