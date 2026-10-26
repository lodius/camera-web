import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sqlite3 from "sqlite3";
import { open, Database } from "sqlite";
import { loginDeviceByIp } from "tp-link-tapo-connect";

const app = express();

// The API is reached through the local Nginx reverse proxy. Binding to loopback
// prevents accidental direct exposure on the LAN or public interfaces.
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const TAPO_DEVICE_IP = process.env.TAPO_DEVICE_IP;
const TAPO_EMAIL = process.env.TAPO_EMAIL;
const TAPO_PASSWORD = process.env.TAPO_PASSWORD;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not configured");
}

app.use(cors());

app.use(express.json());

let db: Database;

function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const authorization = req.header("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  try {
    const decoded = jwt.verify(match[1], JWT_SECRET);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.userId !== "number"
    ) {
      return res.status(401).json({
        message: "Invalid token",
      });
    }

    return next();
  } catch {
    return res.status(401).json({
      message: "Invalid token",
    });
  }
}

function getTapoConfig() {
  if (!TAPO_DEVICE_IP || !TAPO_EMAIL || !TAPO_PASSWORD) {
    return null;
  }

  return {
    ip: TAPO_DEVICE_IP,
    email: TAPO_EMAIL,
    password: TAPO_PASSWORD,
  };
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

app.get("/api/tapo/power", requireAuth, async (_req, res) => {
  const config = getTapoConfig();

  if (!config) {
    return res.status(503).json({
      message: "Tapo plug is not configured on the server",
    });
  }

  try {
    const device = await loginDeviceByIp(
      config.email,
      config.password,
      config.ip
    );
    const info = await device.getDeviceInfo();

    return res.json({
      on: info.device_on,
    });
  } catch (error) {
    console.error("Failed to read Tapo plug state:", error);

    return res.status(502).json({
      message: "Could not connect to the Tapo plug",
    });
  }
});

app.put("/api/tapo/power", requireAuth, async (req, res) => {
  const { on } = req.body;

  if (typeof on !== "boolean") {
    return res.status(400).json({
      message: "A boolean 'on' value is required",
    });
  }

  const config = getTapoConfig();

  if (!config) {
    return res.status(503).json({
      message: "Tapo plug is not configured on the server",
    });
  }

  try {
    const device = await loginDeviceByIp(
      config.email,
      config.password,
      config.ip
    );

    if (on) {
      await device.turnOn();
    } else {
      await device.turnOff();
    }

    const info = await device.getDeviceInfo();

    return res.json({
      on: info.device_on,
    });
  } catch (error) {
    console.error("Failed to update Tapo plug state:", error);

    return res.status(502).json({
      message: "Could not control the Tapo plug",
    });
  }
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

    if (!username || !password) {
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
