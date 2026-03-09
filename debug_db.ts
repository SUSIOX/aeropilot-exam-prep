import Database from "better-sqlite3";
const db = new Database("aeropilot.db");
const counts = db.prepare("SELECT is_ai, COUNT(*) as count FROM questions GROUP BY is_ai").all();
console.log(counts);
