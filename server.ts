import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("aeropilot.db");
const JWT_SECRET = process.env.JWT_SECRET || 'aeropilot-secret-key-2024';

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    explanation TEXT,
    difficulty REAL DEFAULT 0.5,
    image TEXT,
    lo_id TEXT,
    source TEXT DEFAULT 'easa',
    is_ai INTEGER DEFAULT 0,
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );

  CREATE TABLE IF NOT EXISTS user_progress (
    user_id INTEGER,
    question_id INTEGER,
    correct_count INTEGER DEFAULT 0,
    incorrect_count INTEGER DEFAULT 0,
    last_practiced DATETIME,
    is_flagged BOOLEAN DEFAULT 0,
    PRIMARY KEY (user_id, question_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (question_id) REFERENCES questions(id)
  );

  CREATE TABLE IF NOT EXISTS exam_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    score INTEGER,
    total INTEGER,
    subject_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
  );
`);

// Migration: Handle transition from old user_progress (without user_id)
const progressTableInfo = db.prepare("PRAGMA table_info(user_progress)").all() as any[];
const hasUserIdInProgress = progressTableInfo.some(col => col.name === 'user_id');

if (!hasUserIdInProgress) {
  console.log("Migrating user_progress table to multi-user support...");
  
  // 1. Create a default user if none exists
  const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  let adminId = (adminExists as any)?.id;
  if (!adminId) {
    const hashedPw = bcrypt.hashSync('admin123', 10);
    const result = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run('admin', hashedPw);
    adminId = result.lastInsertRowid;
  }

  // 2. Rename old table
  db.exec("ALTER TABLE user_progress RENAME TO user_progress_old");
  
  // 3. Create new table (already done by db.exec above, but let's be sure)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_progress (
      user_id INTEGER,
      question_id INTEGER,
      correct_count INTEGER DEFAULT 0,
      incorrect_count INTEGER DEFAULT 0,
      last_practiced DATETIME,
      is_flagged BOOLEAN DEFAULT 0,
      PRIMARY KEY (user_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )
  `);

  // 4. Migrate data to admin user
  db.exec(`
    INSERT INTO user_progress (user_id, question_id, correct_count, incorrect_count, last_practiced, is_flagged)
    SELECT ${adminId}, question_id, correct_count, incorrect_count, last_practiced, is_flagged FROM user_progress_old
  `);

  // 5. Drop old table
  db.exec("DROP TABLE user_progress_old");
}

// Migration: Ensure exam_history has user_id
const examTableInfo = db.prepare("PRAGMA table_info(exam_history)").all() as any[];
const hasUserIdInExam = examTableInfo.some(col => col.name === 'user_id');
if (!hasUserIdInExam) {
  db.exec("ALTER TABLE exam_history ADD COLUMN user_id INTEGER REFERENCES users(id)");
  // Assign existing exams to admin
  const admin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get() as any;
  if (admin) {
    db.prepare("UPDATE exam_history SET user_id = ?").run(admin.id);
  }
}

// Migration: Ensure 'image' and 'lo_id' columns exist in 'questions' table
const tableInfo = db.prepare("PRAGMA table_info(questions)").all() as any[];
const hasImageColumn = tableInfo.some(col => col.name === 'image');
if (!hasImageColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN image TEXT");
}

const hasIsAiColumn = tableInfo.some(col => col.name === 'is_ai');
if (!hasIsAiColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN is_ai INTEGER DEFAULT 0");
  // Update existing AI questions
  db.prepare("UPDATE questions SET is_ai = 1 WHERE source = 'ai'").run();
}
const hasLoIdColumn = tableInfo.some(col => col.name === 'lo_id');
if (!hasLoIdColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN lo_id TEXT");
}
db.prepare("UPDATE questions SET lo_id = NULL WHERE lo_id = 'EASA' OR lo_id = 'JSON Import'").run();
const hasSourceColumn = tableInfo.some(col => col.name === 'source');
if (!hasSourceColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN source TEXT DEFAULT 'easa'");
}

// Add AI explanation columns
const hasAiExplanationColumn = tableInfo.some(col => col.name === 'ai_explanation');
if (!hasAiExplanationColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN ai_explanation TEXT");
}

const hasAiDetailedExplanationColumn = tableInfo.some(col => col.name === 'ai_detailed_explanation');
if (!hasAiDetailedExplanationColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN ai_detailed_explanation TEXT");
}

const hasAiExplanationProviderColumn = tableInfo.some(col => col.name === 'ai_explanation_provider');
if (!hasAiExplanationProviderColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN ai_explanation_provider TEXT");
}

const hasAiExplanationModelColumn = tableInfo.some(col => col.name === 'ai_explanation_model');
if (!hasAiExplanationModelColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN ai_explanation_model TEXT");
}

const hasAiExplanationUpdatedAtColumn = tableInfo.some(col => col.name === 'ai_explanation_updated_at');
if (!hasAiExplanationUpdatedAtColumn) {
  db.exec("ALTER TABLE questions ADD COLUMN ai_explanation_updated_at DATETIME");
}

// Migration: Database Audit
// All questions from .json files are 'user', others are 'ai'
console.log("Starting database audit...");
db.transaction(() => {
  // First, assume everything is AI
  db.prepare("UPDATE questions SET is_ai = 1, source = 'ai'").run();

  // Then, mark questions from JSON files as user
  const subjectsToAudit = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const subjectId of subjectsToAudit) {
    const filePath = path.join(__dirname, `subject_${subjectId}.json`);
    if (fs.existsSync(filePath)) {
      const questions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const updateStmt = db.prepare("UPDATE questions SET is_ai = 0, source = 'user' WHERE subject_id = ? AND text = ?");
      for (const q of questions) {
        updateStmt.run(subjectId, q.question || "Bez textu");
      }
    }
  }
})();
console.log("Database audit completed.");

// Seed Subjects
const subjects = [
  "Letecké právo a postupy ATC",
  "Lidská výkonnost",
  "Meteorologie",
  "Komunikace",
  "Základy letu",
  "Provozní postupy",
  "Provedení a plánování letu",
  "Všeobecné znalosti o letadle",
  "Navigace"
];

const insertSubject = db.prepare("INSERT OR IGNORE INTO subjects (name) VALUES (?)");
subjects.forEach(s => insertSubject.run(s));

// Seed some sample questions if empty
const questionCount = db.prepare("SELECT COUNT(*) as count FROM questions").get() as { count: number };

// Function to seed from JSON files
function seedFromJson() {
  const subjectsToSeed = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const subjectId of subjectsToSeed) {
    const filePath = path.join(__dirname, `subject_${subjectId}.json`);
    if (fs.existsSync(filePath)) {
      const questions = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const checkStmt = db.prepare('SELECT id FROM questions WHERE subject_id = ? AND text = ?');
      const insertStmt = db.prepare(`
        INSERT INTO questions (
          subject_id, text, option_a, option_b, option_c, option_d, 
          correct_option, explanation, image, lo_id, source, is_ai
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.transaction(() => {
        for (const q of questions) {
          const text = q.question || "Bez textu";
          const existing = checkStmt.get(subjectId, text);
          if (!existing) {
            const options = q.answers || [];
            insertStmt.run(
              subjectId,
              text,
              options[0] || 'N/A',
              options[1] || 'N/A',
              options[2] || 'N/A',
              options[3] || 'N/A',
              ['A', 'B', 'C', 'D'][q.correct] || 'A',
              q.explanation || 'Uživatelská otázka z JSON.',
              q.image || null,
              'JSON Import',
              'user',
              0
            );
          }
        }
      })();
      console.log(`Seeded subject ${subjectId} from JSON.`);
    }
  }
}

seedFromJson();

if (questionCount.count === 0) {
  const insertQuestion = db.prepare(`
    INSERT INTO questions (subject_id, text, option_a, option_b, option_c, option_d, correct_option, explanation, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Sample questions for "Letecké právo"
  insertQuestion.run(1, 
    "Který orgán v ČR vydává letecké předpisy?", 
    "Ministerstvo dopravy", 
    "Úřad pro civilní letectví (ÚCL)", 
    "Řízení letového provozu (ŘLP)", 
    "Vláda ČR", 
    "B", 
    "ÚCL je národním dozorovým orgánem nad civilním letectvím v ČR.",
    "user");

  insertQuestion.run(1, 
    "Jaká je minimální výška pro let nad hustě zastavěnou oblastí?", 
    "150 m (500 ft) nad nejvyšší překážkou", 
    "300 m (1000 ft) nad nejvyšší překážkou v okruhu 600 m", 
    "500 m (1600 ft) nad zemí", 
    "Žádná minimální výška není stanovena", 
    "B", 
    "Dle předpisu L2 (Pravidla létání) je to 300m nad nejvyšší překážkou v okruhu 600m.",
    "user");

  // Sample for Meteorologie
  insertQuestion.run(3, 
    "Co označuje zkratka CAVOK?", 
    "Clear Air Visibility OK", 
    "Visibility, cloud and present weather better than prescribed values", 
    "Clouds Above Vertical Observation Kilometer", 
    "Ceiling And Visibility OK", 
    "B", 
    "CAVOK se používá, když je dohlednost 10 km a více, žádná oblačnost pod 5000 ft a žádné význačné jevy.",
    "user");

  // Sample for Lidská výkonnost
  insertQuestion.run(2, 
    "Jaký je vliv alkoholu na výkonnost pilota?", 
    "Zlepšuje reakční čas", 
    "Zhoršuje úsudek a prodlužuje reakční čas", 
    "Nemá žádný vliv v malém množství", 
    "Zvyšuje odolnost vůči hypoxii", 
    "B", 
    "Alkohol i v malém množství negativně ovlivňuje úsudek, koordinaci a reakční časy.",
    "user");

  // Sample for Komunikace
  insertQuestion.run(4, 
    "Jak se v letectví hláskuje písmeno 'A'?", 
    "Apple", 
    "Alpha", 
    "Alfa", 
    "America", 
    "C", 
    "Dle mezinárodní hláskovací abecedy ICAO je to Alfa.",
    "user");

  // Sample for Navigace
  insertQuestion.run(9, 
    "Co je to deklinace?", 
    "Úhel mezi zeměpisným a magnetickým poledníkem", 
    "Úhel mezi osou letadla a směrem větru", 
    "Chyba kompasu způsobená kovy v letadle", 
    "Sklon magnetické jehly k horizontu", 
    "A", 
    "Magnetická deklinace (variace) je úhel mezi směrem k zeměpisnému a magnetickému severnímu pólu.",
    "user");

  // Add more mock questions for other subjects to make it look populated
  const otherSubjects = [5, 6, 7, 8];
  otherSubjects.forEach(sid => {
    insertQuestion.run(sid, 
      `Ukázková otázka pro předmět ID ${sid}`, 
      "Možnost A", "Možnost B", "Možnost C", "Možnost D", 
      "A", 
      "Toto je vysvětlení pro ukázkovou otázku.",
      "user");
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: "Forbidden" });
      req.user = user;
      next();
    });
  };

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashedPassword);
      const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET);
      res.json({ token, user: { id: result.lastInsertRowid, username } });
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: "Username already exists" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username } });
  });

  app.get("/api/auth/me", authenticateToken, (req: any, res) => {
    res.json({ user: req.user });
  });

  // API Routes
  app.get("/api/subjects", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    const rows = db.prepare(`
      SELECT s.*, 
      (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id) as question_count,
      (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id AND q.is_ai = 0) as user_count,
      (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id AND q.is_ai = 1) as ai_count,
      (SELECT AVG(CASE WHEN up.correct_count + up.incorrect_count > 0 THEN CAST(up.correct_count AS FLOAT) / (up.correct_count + up.incorrect_count) ELSE 0 END) 
       FROM questions q LEFT JOIN user_progress up ON q.id = up.question_id AND up.user_id = ? WHERE q.subject_id = s.id) as success_rate
      FROM subjects s
    `).all(userId);
    res.json(rows);
  });

  app.get("/api/questions/mix", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    // 100 random questions
    const rows = db.prepare(`
      SELECT q.*, up.correct_count, up.incorrect_count, up.is_flagged, up.last_practiced
      FROM questions q
      LEFT JOIN user_progress up ON q.id = up.question_id AND up.user_id = ?
      ORDER BY RANDOM()
      LIMIT 100
    `).all(userId);
    res.json(rows);
  });

  app.get("/api/questions/errors", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    // 100 questions with incorrect answers (prioritized)
    const rows = db.prepare(`
      SELECT q.*, up.correct_count, up.incorrect_count, up.is_flagged, up.last_practiced
      FROM questions q
      JOIN user_progress up ON q.id = up.question_id AND up.user_id = ?
      WHERE up.incorrect_count > 0
      ORDER BY up.incorrect_count DESC, RANDOM()
      LIMIT 100
    `).all(userId);
    res.json(rows);
  });

  app.get("/api/questions/:subjectId", authenticateToken, (req: any, res) => {
    const { subjectId } = req.params;
    const { sort } = req.query;
    const userId = req.user.id;
    
    let orderBy = "q.id ASC";
    if (sort === "hardest_first") orderBy = "CAST(up.correct_count AS FLOAT) / NULLIF(up.correct_count + up.incorrect_count, 0) ASC";
    if (sort === "least_practiced") orderBy = "up.last_practiced ASC NULLS FIRST";

    const rows = db.prepare(`
      SELECT q.*, up.correct_count, up.incorrect_count, up.is_flagged, up.last_practiced
      FROM questions q
      LEFT JOIN user_progress up ON q.id = up.question_id AND up.user_id = ?
      WHERE q.subject_id = ?
      ORDER BY ${orderBy}
    `).all(userId, subjectId);
    res.json(rows);
  });

  app.post("/api/answer", authenticateToken, (req: any, res) => {
    const { questionId, isCorrect } = req.body;
    const userId = req.user.id;
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO user_progress (user_id, question_id, correct_count, incorrect_count, last_practiced)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET
        correct_count = correct_count + ?,
        incorrect_count = incorrect_count + ?,
        last_practiced = ?
    `).run(
      userId, questionId, isCorrect ? 1 : 0, isCorrect ? 0 : 1, now,
      isCorrect ? 1 : 0, isCorrect ? 0 : 1, now
    );
    
    res.json({ success: true });
  });

  app.post("/api/flag", authenticateToken, (req: any, res) => {
    const { questionId, isFlagged } = req.body;
    const userId = req.user.id;
    db.prepare(`
      INSERT INTO user_progress (user_id, question_id, is_flagged)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, question_id) DO UPDATE SET is_flagged = ?
    `).run(userId, questionId, isFlagged ? 1 : 0, isFlagged ? 1 : 0);
    res.json({ success: true });
  });

  app.post("/api/questions/objective", authenticateToken, (req, res) => {
    const { questionId, objective } = req.body;
    
    if (!questionId || !objective) {
      return res.status(400).json({ error: "Missing questionId or objective" });
    }

    try {
      // Update the question with the AI-detected objective
      const stmt = db.prepare(`
        UPDATE questions 
        SET lo_id = ? 
        WHERE id = ? AND (source = 'user' OR lo_id IS NULL OR lo_id = '')
      `);
      
      const result = stmt.run(objective, questionId);
      
      if (result.changes > 0) {
        console.log(`Updated objective for question ${questionId}: ${objective}`);
        res.json({ success: true, objective });
      } else {
        res.status(404).json({ error: "Question not found or already has LO" });
      }
    } catch (error) {
      console.error("Error updating objective:", error);
      res.status(500).json({ error: "Failed to update objective" });
    }
  });

  app.post("/api/questions/explanation", authenticateToken, (req, res) => {
    const { questionId, explanation, detailedExplanation, provider, model } = req.body;
    
    if (!questionId || !explanation) {
      return res.status(400).json({ error: "Missing questionId or explanation" });
    }

    try {
      // Save AI explanations to database for reuse
      const stmt = db.prepare(`
        UPDATE questions 
        SET ai_explanation = ?, 
            ai_detailed_explanation = ?,
            ai_explanation_provider = ?,
            ai_explanation_model = ?,
            ai_explanation_updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      const result = stmt.run(explanation, detailedExplanation || null, provider, model, questionId);
      
      if (result.changes > 0) {
        console.log(`Saved AI explanation for question ${questionId} using ${provider}/${model}`);
        res.json({ success: true, explanation, detailedExplanation });
      } else {
        res.status(404).json({ error: "Question not found" });
      }
    } catch (error) {
      console.error("Error saving AI explanation:", error);
      res.status(500).json({ error: "Failed to save AI explanation" });
    }
  });

  app.post("/api/import-questions", authenticateToken, (req, res) => {
    const { subjectId, questions, clearExisting } = req.body;
    
    if (!subjectId || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: "Invalid data" });
    }

    const transaction = db.transaction((data) => {
      if (clearExisting) {
        db.prepare("DELETE FROM user_progress WHERE question_id IN (SELECT id FROM questions WHERE subject_id = ?)").run(subjectId);
        db.prepare("DELETE FROM questions WHERE subject_id = ?").run(subjectId);
      }

      const checkDuplicate = db.prepare("SELECT id FROM questions WHERE subject_id = ? AND text = ?");
      const insert = db.prepare(`
        INSERT INTO questions (subject_id, text, option_a, option_b, option_c, option_d, correct_option, explanation, image, lo_id, source, is_ai)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let importedCount = 0;
      for (const q of data) {
        const text = q.question || "Bez textu";
        
        // Skip if duplicate exists in this subject
        const existing = checkDuplicate.get(subjectId, text);
        if (existing) continue;

        const correctMap = ['A', 'B', 'C', 'D'];
        const answers = Array.isArray(q.answers) ? q.answers : [];
        
        insert.run(
          subjectId,
          text,
          answers[0] || "Možnost A",
          answers[1] || "Možnost B",
          answers[2] || "Možnost C",
          answers[3] || "Možnost D",
          correctMap[q.correct] || 'A',
          q.explanation || null,
          q.image || null,
          q.lo_id || null,
          q.source || 'user',
          q.is_ai || (q.source === 'ai' ? 1 : 0)
        );
        importedCount++;
      }
      return importedCount;
    });

    try {
      const count = transaction(questions);
      res.json({ success: true, count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Import failed" });
    }
  });

  app.get("/api/stats", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    const totalQuestions = db.prepare("SELECT COUNT(*) as count FROM questions").get() as { count: number };
    const userQuestions = db.prepare("SELECT COUNT(*) as count FROM questions WHERE is_ai = 0").get() as { count: number };
    const aiQuestions = db.prepare("SELECT COUNT(*) as count FROM questions WHERE is_ai = 1").get() as { count: number };
    const practicedQuestions = db.prepare("SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND (correct_count + incorrect_count > 0)").get(userId) as { count: number };
    const overallSuccess = db.prepare(`
      SELECT SUM(correct_count) as correct, SUM(incorrect_count) as incorrect 
      FROM user_progress
      WHERE user_id = ?
    `).get(userId) as { correct: number, incorrect: number };

    const subjectStats = db.prepare(`
      SELECT s.name, 
      AVG(CASE WHEN up.correct_count + up.incorrect_count > 0 THEN CAST(up.correct_count AS FLOAT) / (up.correct_count + up.incorrect_count) ELSE 0 END) as rate
      FROM subjects s
      JOIN questions q ON q.subject_id = s.id
      LEFT JOIN user_progress up ON q.id = up.question_id AND up.user_id = ?
      GROUP BY s.id
    `).all(userId);

    res.json({
      totalQuestions: totalQuestions.count,
      userQuestions: userQuestions.count,
      aiQuestions: aiQuestions.count,
      practicedQuestions: practicedQuestions.count,
      overallSuccess: (overallSuccess?.correct || 0) / ((overallSuccess?.correct || 0) + (overallSuccess?.incorrect || 0) || 1),
      subjectStats
    });
  });

  app.post("/api/reset-progress", authenticateToken, (req: any, res) => {
    const userId = req.user.id;
    try {
      db.prepare("DELETE FROM user_progress WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM exam_history WHERE user_id = ?").run(userId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset progress" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
