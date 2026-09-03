import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import readline from "readline";

const db = new Database("camera.db");

const rl = readline.createInterface({
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

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db
      .prepare(
        "UPDATE users SET password_hash = ? WHERE username = ?"
      )
      .run(passwordHash, "admin");

    if (result.changes === 0) {
      console.error("Admin user was not found.");
      process.exitCode = 1;
      return;
    }

    console.log("Admin password changed successfully.");
  } finally {
    db.close();
    rl.close();
  }
});