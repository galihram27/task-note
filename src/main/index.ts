import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, Menu } from 'electron'
import type { AppUrlOptions } from './appUrl'
import { installSecurityGuards } from './security'
import { createMainWindow } from './window'

// Data dev dipisah dari data asli. Harus dipanggil sebelum event `ready`.
if (!app.isPackaged) {
  app.setPath('userData', join(app.getPath('appData'), 'TaskNote (Dev)'))
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

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    // Menu bawaan (dan shortcut DevTools-nya) hanya ada saat pengembangan.
    if (app.isPackaged) Menu.setApplicationMenu(null)

    installSecurityGuards(appUrls)
    mainWindow = createMainWindow(rendererUrl)
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  })

  app.on('window-all-closed', () => app.quit())
}
