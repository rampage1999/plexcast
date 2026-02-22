const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'plexcast.db');

let db = null;

async function initDb() {
  if (db) return db;

  // sql.js/dist/sql-asm.js is pure JS — no native compilation needed
  const initSqlJs = require('sql.js/dist/sql-asm.js');
  const SQL = await initSqlJs();

  let fileBuffer = null;
  if (fs.existsSync(DB_PATH)) {
    fileBuffer = fs.readFileSync(DB_PATH);
  }

  const sqlDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  db = new SqlJsWrapper(sqlDb);
  initSchema();
  return db;
}

function getDb() {
  if (!db) throw new Error('DB not initialized. Call initDb() first.');
  return db;
}

class SqlJsWrapper {
  constructor(sqlDb) {
    this._db = sqlDb;
    this._saveTimer = null;
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const data = this._db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
      } catch (err) {
        console.error('DB save error:', err.message);
      }
    }, 500);
  }

  exec(sql) {
    this._db.run(sql);
    this._scheduleSave();
    return this;
  }

  pragma() { return this; }

  prepare(sql) {
    return new StatementWrapper(this._db, sql, () => this._scheduleSave());
  }

  transaction(fn) {
    // sql.js is synchronous — just wrap in a function
    return (...args) => fn(...args);
  }
}

class StatementWrapper {
  constructor(db, sql, onWrite) {
    this._db = db;
    this._sql = sql;
    this._onWrite = onWrite;
  }

  get(...args) {
    try {
      const stmt = this._db.prepare(this._sql);
      const raw = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      const p = raw.map(v => (v === undefined ? null : v));
      if (p.length) stmt.bind(p);
      const row = stmt.step() ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    } catch (err) {
      console.error('DB get error:', err?.message || err, '\nSQL:', this._sql);
      return undefined;
    }
  }

  all(...args) {
    try {
      const stmt = this._db.prepare(this._sql);
      const raw = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      const p = raw.map(v => (v === undefined ? null : v));
      if (p.length) stmt.bind(p);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (err) {
      console.error('DB all error:', err?.message || err, '\nSQL:', this._sql);
      return [];
    }
  }

  run(params = []) {
    try {
      const raw = Array.isArray(params) ? params : [params];
      const p = raw.map(v => (v === undefined ? null : v));
      this._db.run(this._sql, p);
      this._onWrite();
      return this;
    } catch (err) {
      console.error('DB run error:', err?.message || err, '\nSQL:', this._sql);
      throw err;
    }
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      number INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      logo TEXT,
      library_id TEXT,
      library_name TEXT,
      playback_mode TEXT DEFAULT 'shuffle',
      genre_filter TEXT,
      decade_filter TEXT,
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS schedule (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      media_id TEXT NOT NULL,
      media_title TEXT,
      media_thumb TEXT,
      media_duration INTEGER,
      start_time INTEGER NOT NULL,
      end_time INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_schedule_channel ON schedule(channel_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_time ON schedule(start_time, end_time);
  `);
}

module.exports = { getDb, initDb };
