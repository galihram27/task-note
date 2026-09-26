// Terapkan migrasi ke database dev tanpa membuka aplikasi: `npm run db:migrate`.
// Biasanya tidak perlu karena aplikasi menjalankan migrasi otomatis saat start.
// Sama seperti aplikasi, salinan .sqlite dibuat dulu jika ada migrasi tertunda
// pada database yang sudah berisi data.
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'

const MIGRATIONS_TABLE = '__drizzle_migrations'
const migrationsFolder = join(import.meta.dirname, '..', 'drizzle')

function devUserDataPath() {
  if (process.platform === 'win32') return join(process.env.APPDATA ?? '', 'TaskNote (Dev)')
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'TaskNote (Dev)')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'TaskNote (Dev)')
}

// Waktu migrasi terakhir yang sudah diterapkan, atau null untuk database baru.
function lastAppliedAt(sqlite) {
  const table = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(MIGRATIONS_TABLE)
  if (!table) return null
  const row = sqlite
    .prepare(
      `SELECT created_at AS createdAt FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
    )
    .get()
  return row ? Number(row.createdAt) : null
}

const userData = devUserDataPath()
const dbPath = join(userData, 'tasknote.db')
mkdirSync(userData, { recursive: true })

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const applied = lastAppliedAt(sqlite)
const pending = readMigrationFiles({ migrationsFolder }).filter(
  (migration) => applied === null || migration.folderMillis > applied,
)

if (pending.length === 0) {
  console.log(`Database is up to date: ${dbPath}`)
} else {
  if (applied !== null) {
    const backupDir = join(userData, 'backups')
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(backupDir, `pre-migrate-${stamp}.sqlite`)
    await sqlite.backup(backupPath)
    console.log(`Backup created: ${backupPath}`)
  }
  migrate(drizzle({ client: sqlite }), { migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
  console.log(`Applied ${pending.length} migration(s): ${dbPath}`)
}
sqlite.close()
