"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const tp_link_tapo_connect_1 = require("tp-link-tapo-connect");
const app = (0, express_1.default)();
// The API is reached through the local Nginx reverse proxy. Binding to loopback
// prevents accidental direct exposure on the LAN or public interfaces.
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "127.0.0.1";
const JWT_SECRET = process.env.JWT_SECRET ?? "";
const TAPO_DEVICE_IP = process.env.TAPO_DEVICE_IP;
const TAPO_EMAIL = process.env.TAPO_EMAIL;
const TAPO_PASSWORD = process.env.TAPO_PASSWORD;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
}
app.use((0, cors_1.default)());
app.use(express_1.default.json());
let db;
function getLoginClientKey(req) {
    // Express is reachable only through local Nginx, which supplies X-Real-IP.
    return req.get("x-real-ip") || req.ip;
}
function isLoginRateLimited(key, now) {
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
function recordLoginFailure(key, now) {
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
function requireAuth(req, res, next) {
    const authorization = req.header("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return res.status(401).json({
            message: "Authentication required",
        });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(match[1], JWT_SECRET);
        if (typeof decoded !== "object" ||
            decoded === null ||
            typeof decoded.userId !== "number") {
            return res.status(401).json({
                message: "Invalid token",
            });
        }
        return next();
    }
    catch {
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
    db = await (0, sqlite_1.open)({
        filename: "./camera.db",
        driver: sqlite3_1.default.Database,
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
        const device = await (0, tp_link_tapo_connect_1.loginDeviceByIp)(config.email, config.password, config.ip);
        const info = await device.getDeviceInfo();
        return res.json({
            on: info.device_on,
        });
    }
    catch (error) {
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
        const device = await (0, tp_link_tapo_connect_1.loginDeviceByIp)(config.email, config.password, config.ip);
        if (on) {
            await device.turnOn();
        }
        else {
            await device.turnOff();
        }
        const info = await device.getDeviceInfo();
        return res.json({
            on: info.device_on,
        });
    }
    catch (error) {
        console.error("Failed to update Tapo plug state:", error);
        return res.status(502).json({
            message: "Could not control the Tapo plug",
        });
    }
});
app.post("/api/mediamtx/auth", async (req, res) => {
    const { user, password, token, action, path, protocol, ip, } = req.body;
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
    if (action === "publish" &&
        protocol === "rtsp" &&
        path === "camera" &&
        (ip === "127.0.0.1" || ip === "::1")) {
        return res.sendStatus(200);
    }
    // --------------------------------------------------
    // Browser WebRTC reader
    // --------------------------------------------------
    //
    // Browser must provide a valid JWT.
    //
    if (action !== "read" ||
        protocol !== "webrtc" ||
        path !== "camera") {
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
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (typeof decoded !== "object" ||
            decoded === null ||
            !("userId" in decoded)) {
            return res.status(401).json({
                message: "Invalid token",
            });
        }
        return res.sendStatus(200);
    }
    catch (error) {
        console.error("JWT verification failed:", error);
        return res.status(401).json({
            message: "Invalid token",
        });
    }
});
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (typeof username !== "string" ||
            typeof password !== "string" ||
            !username ||
            !password) {
            return res.status(400).json({
                message: "Username and password are required",
            });
        }
        const user = await db.get(`
      SELECT id, username, password_hash
      FROM users
      WHERE username = ?
      `, username);
        if (!user) {
            return res.status(401).json({
                message: "Invalid username or password",
            });
        }
        const validPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                message: "Invalid username or password",
            });
        }
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            username: user.username,
        }, JWT_SECRET, {
            expiresIn: "8h",
        });
        return res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
            },
        });
    }
    catch (error) {
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
            console.log(`Camera API running on http://${HOST}:${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
startServer();
