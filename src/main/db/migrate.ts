import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import type { Clock } from '../clock'
import type { DatabaseHandle } from './client'

const MIGRATIONS_TABLE = '__drizzle_migrations'
const BACKUP_PREFIX = 'pre-migrate-'
const BACKUP_EXTENSION = '.sqlite'
// Jumlah backup pra-migrasi yang disimpan (PLAN §7.10 B7)
export const PRE_MIGRATION_BACKUPS_TO_KEEP = 5

export interface MigrationOutcome {
  // Jumlah migrasi yang baru diterapkan
  applied: number
  // Lokasi backup yang dibuat sebelum migrasi (hanya jika DB sudah berisi data)
  backupPath: string | null
}

// Hitung migrasi yang belum diterapkan dengan aturan yang sama seperti migrator Drizzle:
// migrasi dianggap tertunda jika `when` di journal lebih baru dari `created_at` terakhir.
export function countPendingMigrations(handle: DatabaseHandle, migrationsFolder: string): number {
  const migrations = readMigrationFiles({ migrationsFolder })
  const lastAppliedAt = getLastAppliedMigrationTime(handle)
  if (lastAppliedAt === null) return migrations.length
  return migrations.filter((migration) => migration.folderMillis > lastAppliedAt).length
}

// Terapkan migrasi tertunda. Jika database sudah pernah dimigrasi (berisi data), salinan
// `.sqlite` dibuat dulu di `backupDir` sehingga data bisa dipulihkan bila migrasi gagal.
export async function runMigrations(options: {
  handle: DatabaseHandle
  migrationsFolder: string
  backupDir: string
  clock: Clock
}): Promise<MigrationOutcome> {
  const { handle, migrationsFolder, backupDir, clock } = options
  const pending = countPendingMigrations(handle, migrationsFolder)
  if (pending === 0) return { applied: 0, backupPath: null }

  let backupPath: string | null = null
  if (getLastAppliedMigrationTime(handle) !== null) {
    mkdirSync(backupDir, { recursive: true })
    backupPath = join(
      backupDir,
      `${BACKUP_PREFIX}${timestampForFile(clock.now())}${BACKUP_EXTENSION}`,
    )
    await handle.sqlite.backup(backupPath)
    prunePreMigrationBackups(backupDir, PRE_MIGRATION_BACKUPS_TO_KEEP)
  }

  migrate(handle.db, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
  return { applied: pending, backupPath }
}

// Versi sinkron tanpa backup, untuk database baru atau `:memory:` di test.
export function applyMigrationsSync(handle: DatabaseHandle, migrationsFolder: string): void {
  migrate(handle.db, { migrationsFolder, migrationsTable: MIGRATIONS_TABLE })
}

function getLastAppliedMigrationTime(handle: DatabaseHandle): number | null {
  const table = handle.sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(MIGRATIONS_TABLE)
  if (!table) return null
  const row = handle.sqlite
    .prepare(
      `SELECT created_at AS createdAt FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`,
    )
    .get() as { createdAt: number | string } | undefined
  return row ? Number(row.createdAt) : null
}

// Hapus backup pra-migrasi lama, sisakan `keep` file terbaru. File lain di folder tidak disentuh.
export function prunePreMigrationBackups(backupDir: string, keep: number): void {
  const backups = readdirSync(backupDir)
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_EXTENSION))
    .sort()
  // Nama berisi timestamp yang bisa diurutkan, jadi urutan leksikografis = urutan waktu.
  for (const name of backups.slice(0, Math.max(0, backups.length - keep))) {
    rmSync(join(backupDir, name), { force: true })
  }
}

// Timestamp aman untuk nama file, mis. 2026-09-26T08-30-00-123Z
function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}
