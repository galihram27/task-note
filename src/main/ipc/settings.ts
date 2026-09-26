import type { Clock } from '../clock'
import type { AppDatabase } from '../db/client'
import { getSetting, setSetting } from '../services/settingsService'
import type { RegisterHandler } from './register'

export function registerSettingsChannels(
  handle: RegisterHandler,
  db: AppDatabase,
  clock: Clock,
): void {
  handle('settings:get', ({ key }) => getSetting(db, key))
  handle('settings:set', ({ key, value }) => setSetting(db, clock, key, value))
}
