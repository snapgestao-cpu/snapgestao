import * as SQLite from 'expo-sqlite'

const DB_NAME = 'snapgestao.db'

let _db: SQLite.SQLiteDatabase | null = null

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!_db) {
    _db = SQLite.openDatabaseSync(DB_NAME)
    initSchema(_db)
  }
  return _db
}

function initSchema(db: SQLite.SQLiteDatabase) {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS pots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      parent_pot_id TEXT,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT NOT NULL,
      limit_amount REAL,
      limit_type TEXT NOT NULL DEFAULT 'absolute',
      is_emergency INTEGER NOT NULL DEFAULT 0,
      mesada_limit REAL,
      mesada_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pot_id TEXT,
      card_id TEXT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      merchant TEXT,
      date TEXT NOT NULL,
      billing_date TEXT,
      payment_method TEXT NOT NULL,
      is_need INTEGER,
      created_at TEXT NOT NULL,
      synced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      horizon_years INTEGER NOT NULL,
      target_date TEXT,
      interest_rate REAL,
      monthly_deposit REAL,
      synced_at TEXT
    );
  `)
}
