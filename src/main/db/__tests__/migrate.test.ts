import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../../clock'
import { openDatabase } from '../client'
import { countPendingMigrations, prunePreMigrationBackups, runMigrations } from '../migrate'
import { MIGRATIONS_FOLDER } from './testDb'

let workDir: string
let migrationsFolder: string
let backupDir: string
let dbPath: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'tasknote-migrate-'))
  migrationsFolder = join(workDir, 'drizzle')
  backupDir = join(workDir, 'backups')
  dbPath = join(workDir, 'tasknote.db')
  // Salinan folder migrasi agar test bisa menambah migrasi dummy tanpa menyentuh repo.
  cpSync(MIGRATIONS_FOLDER, migrationsFolder, { recursive: true })
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

// Tambah migrasi dummy ke journal seperti yang dilakukan `drizzle-kit generate --custom`.
function addDummyMigration(tag: string, sql: string): void {
  const journalPath = join(migrationsFolder, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[]
  }
  const last = journal.entries.at(-1)
  if (!last) throw new Error('Journal is empty')
  journal.entries.push({
    idx: last.idx + 1,
    version: last.version,
    when: last.when + 1000,
    tag,
    breakpoints: true,
  })
  writeFileSync(journalPath, JSON.stringify(journal, null, 2))
  writeFileSync(join(migrationsFolder, `${tag}.sql`), sql)
}

function listBackups(): string[] {
  try {
    return readdirSync(backupDir).filter((name) => name.startsWith('pre-migrate-'))
  } catch {
    return []
  }
}

describe('runMigrations', () => {
  it('migrates a new database without creating a backup', async () => {
    const handle = openDatabase(dbPath)
    const outcome = await runMigrations({
      handle,
      migrationsFolder,
      backupDir,
      clock: fixedClock('2026-09-26T08:00:00Z'),
    })
    expect(outcome).toEqual({ applied: 2, backupPath: null })
    expect(countPendingMigrations(handle, migrationsFolder)).toBe(0)
    expect(listBackups()).toEqual([])
    handle.sqlite.close()
  })

  it('does nothing when there are no pending migrations', async () => {
    const clock = fixedClock('2026-09-26T08:00:00Z')
    const handle = openDatabase(dbPath)
    await runMigrations({ handle, migrationsFolder, backupDir, clock })
    const outcome = await runMigrations({ handle, migrationsFolder, backupDir, clock })
    expect(outcome).toEqual({ applied: 0, backupPath: null })
    expect(listBackups()).toEqual([])
    handle.sqlite.close()
  })

  it('backs up an existing database before applying a new migration', async () => {
    const clock = fixedClock('2026-09-26T08:00:00Z')
    const first = openDatabase(dbPath)
    await runMigrations({ handle: first, migrationsFolder, backupDir, clock })
    first.sqlite
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('ui.lastRoute', '"/notes"', ?)`,
      )
      .run('2026-09-26T08:00:00Z')
    first.sqlite.close()

    addDummyMigration('0002_dummy', 'CREATE TABLE `dummy` (`id` integer PRIMARY KEY);')
    clock.set('2026-09-27T09:30:00Z')
    const second = openDatabase(dbPath)
    expect(countPendingMigrations(second, migrationsFolder)).toBe(1)
    const outcome = await runMigrations({ handle: second, migrationsFolder, backupDir, clock })

    expect(outcome.applied).toBe(1)
    expect(outcome.backupPath).toMatch(/pre-migrate-2026-09-27T09-30-00-000Z\.sqlite$/)
    expect(listBackups()).toEqual(['pre-migrate-2026-09-27T09-30-00-000Z.sqlite'])
    second.sqlite.close()

    // Backup berisi data sebelum migrasi: ada setting, belum ada tabel dummy.
    const backup = openDatabase(outcome.backupPath ?? '')
    expect(backup.sqlite.prepare(`SELECT value FROM settings`).get()).toEqual({ value: '"/notes"' })
    expect(
      backup.sqlite.prepare(`SELECT name FROM sqlite_master WHERE name = 'dummy'`).get(),
    ).toBeUndefined()
    backup.sqlite.close()
  })

  it('rolls back and keeps the backup when a migration fails', async () => {
    const clock = fixedClock('2026-09-26T08:00:00Z')
    const first = openDatabase(dbPath)
    await runMigrations({ handle: first, migrationsFolder, backupDir, clock })
    first.sqlite.close()

    addDummyMigration(
      '0002_broken',
      'CREATE TABLE `ok_table` (`id` integer);\n--> statement-breakpoint\nTHIS IS NOT SQL;',
    )
    const second = openDatabase(dbPath)
    await expect(
      runMigrations({ handle: second, migrationsFolder, backupDir, clock }),
    ).rejects.toThrow()
    expect(listBackups()).toHaveLength(1)
    // Transaksi dibatalkan: tabel dari statement pertama tidak ikut tersimpan.
    expect(
      second.sqlite.prepare(`SELECT name FROM sqlite_master WHERE name = 'ok_table'`).get(),
    ).toBeUndefined()
    second.sqlite.close()
  })
})

describe('prunePreMigrationBackups', () => {
  it('keeps only the newest backups and never touches other files', () => {
    const dir = join(workDir, 'prune')
    cpSync(migrationsFolder, dir, { recursive: true })
    const names = [
      'pre-migrate-2026-01-01T00-00-00-000Z.sqlite',
      'pre-migrate-2026-02-01T00-00-00-000Z.sqlite',
      'pre-migrate-2026-03-01T00-00-00-000Z.sqlite',
    ]
    for (const name of names) writeFileSync(join(dir, name), '')
    writeFileSync(join(dir, 'my-notes.txt'), 'keep me')

    prunePreMigrationBackups(dir, 2)

    const remaining = readdirSync(dir)
    expect(remaining).toContain('my-notes.txt')
    expect(remaining.filter((name) => name.startsWith('pre-migrate-'))).toEqual(names.slice(1))
  })
})
