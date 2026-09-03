"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const readline_1 = __importDefault(require("readline"));
const db = new better_sqlite3_1.default("camera.db");
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout,
});
rl.question("New admin password: ", async (password) => {
    try {
        if (password.length < 12) {
            console.error("Password must be at least 12 characters.");
            process.exitCode = 1;
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        const result = db
            .prepare("UPDATE users SET password_hash = ? WHERE username = ?")
            .run(passwordHash, "admin");
        if (result.changes === 0) {
            console.error("Admin user was not found.");
            process.exitCode = 1;
            return;
        }
        console.log("Admin password changed successfully.");
    }
    finally {
        db.close();
        rl.close();
    }
});
