import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type AppDatabase = BetterSQLite3Database<typeof schema>

export interface DatabaseHandle {
  // Koneksi mentah better-sqlite3 (untuk pragma, backup, dan SQL FTS)
  sqlite: Database.Database
  // Query builder Drizzle bertipe
  db: AppDatabase
}

// Buka database dan pasang pragma standar. `filename` boleh ':memory:' untuk test.
export function openDatabase(filename: string): DatabaseHandle {
  const sqlite = new Database(filename)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 3000')
  const db = drizzle({ client: sqlite, schema, casing: 'snake_case' })
  return { sqlite, db }
}
