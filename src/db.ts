import Database from 'better-sqlite3';

// Use /tmp for Vercel's read-only filesystem
const dbPath = process.env.VERCEL ? '/tmp/advisor.db' : 'advisor.db';
export const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    plan_text TEXT NOT NULL,
    risk_index REAL NOT NULL,
    band TEXT NOT NULL,
    confidence REAL NOT NULL,
    confidence_band TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    notes TEXT,
    reported_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

export function saveAssessment(id: string, plan: string, risk: number, band: string, conf: number, confBand: string) {
  db.prepare('INSERT INTO assessments (id, plan_text, risk_index, band, confidence, confidence_band) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, plan, risk, band, conf, confBand);
}
