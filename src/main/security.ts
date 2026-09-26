import { app, session, shell } from 'electron'
import { isAppUrl, isExternalHttpUrl, type AppUrlOptions } from './appUrl'

// Pasang pengaman global yang berlaku untuk semua webContents:
// blokir navigasi keluar, buka tautan eksternal di browser default,
// tolak webview, dan tolak semua permintaan izin (kamera, notifikasi, dll.).
export function installSecurityGuards(appUrls: AppUrlOptions): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url, appUrls)) event.preventDefault()
    })

    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url, appUrls)) event.preventDefault()
    })

    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalHttpUrl(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
}
