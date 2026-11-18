const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

const databasePath = process.env.DATABASE_PATH || './data/learning.sqlite';
const resolvedPath = path.resolve(__dirname, '..', databasePath);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma('foreign_keys = ON');

function hasColumn(tableName, columnName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().some((column) => column.name === columnName);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      marks REAL NOT NULL CHECK(marks >= 0),
      total_marks REAL NOT NULL CHECK(total_marks > 0),
      study_hours REAL NOT NULL DEFAULT 0 CHECK(study_hours >= 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS quiz_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      topic TEXT NOT NULL DEFAULT '',
      score REAL NOT NULL CHECK(score >= 0),
      total_questions INTEGER NOT NULL CHECK(total_questions > 0),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS study_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS ai_analysis_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      analysis TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS performance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subject TEXT NOT NULL,
      score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
      assessed_on TEXT NOT NULL DEFAULT CURRENT_DATE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  const migrate = db.transaction(() => {
    if (!hasColumn('users', 'password')) {
      db.exec('ALTER TABLE users ADD COLUMN password TEXT');
      if (hasColumn('users', 'password_hash')) {
        db.prepare('UPDATE users SET password = password_hash WHERE password IS NULL').run();
      }
    }

    const legacyRecords = db.prepare('SELECT id, user_id, subject, score, assessed_on FROM performance_records WHERE id NOT IN (SELECT id FROM performance)').all();
    const insertPerformance = db.prepare('INSERT OR IGNORE INTO performance (id, user_id, subject, topic, marks, total_marks, study_hours, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const record of legacyRecords) {
      insertPerformance.run(record.id, record.user_id, record.subject, '', record.score, 100, 0, record.assessed_on);
    }
  });
  migrate();
} catch (error) {
  console.error('SQLite initialization failed:', error);
  db.close();
  throw error;
}

module.exports = db;
