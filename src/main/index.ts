import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, Menu } from 'electron'
import type { AppUrlOptions } from './appUrl'
import { systemClock } from './clock'
import { openDatabase, type DatabaseHandle } from './db/client'
import { runMigrations } from './db/migrate'
import { registerAppChannels } from './ipc/app'
import { createIpcRegistrar } from './ipc/register'
import { registerSettingsChannels } from './ipc/settings'
import { installSecurityGuards } from './security'
import { createMainWindow } from './window'

const DATABASE_FILE = 'tasknote.db'

// Data dev dipisah dari data asli. Harus dipanggil sebelum event `ready`.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'TaskNote (Dev)'))
}

// Lokasi file migrasi: folder `drizzle/` saat dev, `resources/migrations` saat terpasang.
function resolveMigrationsFolder(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(app.getAppPath(), 'drizzle')
}

// Buka database dan terapkan migrasi. Jika gagal, tampilkan lokasi backup lalu keluar.
async function initDatabase(): Promise<DatabaseHandle | null> {
  const userData = app.getPath('userData')
  const dbPath = join(userData, DATABASE_FILE)
  const backupDir = join(userData, 'backups')
  let handle: DatabaseHandle | null = null
  try {
    handle = openDatabase(dbPath)
    await runMigrations({
      handle,
      migrationsFolder: resolveMigrationsFolder(),
      backupDir,
      clock: systemClock,
    })
    return handle
  } catch (error) {
    handle?.sqlite.close()
    console.error('Database initialization failed', error)
    dialog.showErrorBox(
      'TaskNote could not open its database',
      `The database could not be prepared, so TaskNote will close.\n\n` +
        `Database: ${dbPath}\nBackups before updates are kept in: ${backupDir}\n\n` +
        `Details: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

// Hanya satu instance yang boleh berjalan agar database tidak ditulis bersamaan.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const appUrls: AppUrlOptions = {
    devServerUrl: app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'],
    indexFileUrl: pathToFileURL(join(__dirname, '../renderer/index.html')).href,
  }
  const rendererUrl = appUrls.devServerUrl ?? appUrls.indexFileUrl

  let mainWindow: BrowserWindow | null = null
  let database: DatabaseHandle | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    // Menu bawaan (dan shortcut DevTools-nya) hanya ada saat pengembangan.
    if (app.isPackaged) Menu.setApplicationMenu(null)

    database = await initDatabase()
    if (!database) {
      app.quit()
      return
    }

    const handle = createIpcRegistrar({
      appUrls,
      onUnexpectedError: (channel, error) => console.error(`IPC ${channel} failed`, error),
    })
    registerSettingsChannels(handle, database.db, systemClock)
    registerAppChannels(handle, database.sqlite.name)

    installSecurityGuards(appUrls)
    mainWindow = createMainWindow(rendererUrl)
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  })

  app.on('window-all-closed', () => app.quit())

  app.on('will-quit', () => {
    database?.sqlite.close()
    database = null
  })
}
