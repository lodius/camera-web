"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const app = (0, express_1.default)();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
}
app.use((0, cors_1.default)());
app.use(express_1.default.json());
let db;
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
    catch {
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
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Camera API running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}
startServer();
