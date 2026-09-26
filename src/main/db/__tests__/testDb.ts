import { fileURLToPath } from 'node:url'
import { openDatabase, type DatabaseHandle } from '../client'
import { applyMigrationsSync } from '../migrate'

// Folder migrasi asli di root repo. Semua test DB memakai migrasi ini,
// sehingga setiap test sekaligus memvalidasi file migrasi.
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../../drizzle', import.meta.url))

// Database SQLite in-memory yang sudah dimigrasi penuh.
export function createTestDb(): DatabaseHandle {
  const handle = openDatabase(':memory:')
  applyMigrationsSync(handle, MIGRATIONS_FOLDER)
  return handle
}
