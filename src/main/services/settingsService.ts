import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dateKeySchema } from '@shared/ipc/schemas'
import type { Clock } from '../clock'
import type { AppDatabase } from '../db/client'
import { settings } from '../db/schema'
import { AppError } from '../errors'

// Skema nilai untuk setiap key pengaturan (PLAN §4.1). Nilai disimpan sebagai JSON.
export const settingSchemas = {
  'ui.lastRoute': z.string().max(300),
  'ui.lastNotesFolder': z.string().max(300),
  'window.bounds': z.strictObject({
    x: z.number().int(),
    y: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    isMaximized: z.boolean(),
  }),
  'backup.enabled': z.boolean(),
  'backup.dir': z.string().nullable(),
  'backup.lastRunAt': z.iso.datetime(),
  'backup.lastResult': z.strictObject({
    ok: z.boolean(),
    file: z.string().optional(),
    message: z.string().optional(),
  }),
  'todo.resetBannerDismissedDate': dateKeySchema,
} as const

export type SettingKey = keyof typeof settingSchemas
export type SettingValue<K extends SettingKey> = z.output<(typeof settingSchemas)[K]>

// Baca pengaturan. Mengembalikan null jika belum pernah disimpan, atau jika isi tersimpan
// rusak / tidak cocok skema (mis. setelah perubahan format), agar aplikasi tetap jalan.
export function getSetting<K extends SettingKey>(db: AppDatabase, key: K): SettingValue<K> | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
  if (!row) return null

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(row.value)
  } catch {
    return null
  }
  const result = settingSchemas[key].safeParse(parsedJson)
  return result.success ? (result.data as SettingValue<K>) : null
}

// Simpan pengaturan setelah divalidasi. Nilai tidak valid ditolak dengan AppError VALIDATION.
export function setSetting<K extends SettingKey>(
  db: AppDatabase,
  clock: Clock,
  key: K,
  value: SettingValue<K>,
): void {
  const result = settingSchemas[key].safeParse(value)
  if (!result.success) {
    throw new AppError('VALIDATION', `Invalid value for setting "${key}".`)
  }
  const json = JSON.stringify(result.data)
  const updatedAt = clock.now().toISOString()
  db.insert(settings)
    .values({ key, value: json, updatedAt })
    .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt } })
    .run()
}
