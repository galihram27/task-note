import { app } from 'electron'
import type { RegisterHandler } from './register'

export function registerAppChannels(handle: RegisterHandler, dbPath: string): void {
  handle('app:getInfo', () => ({
    version: app.getVersion(),
    dbPath,
    userDataPath: app.getPath('userData'),
  }))
}
