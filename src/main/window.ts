import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

// Warna latar harus sama dengan tema agar tidak ada kilatan putih saat jendela dibuka.
const BACKGROUND_COLOR = '#080808'

export function createMainWindow(rendererUrl: string): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'TaskNote',
    backgroundColor: BACKGROUND_COLOR,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  // Tampilkan setelah konten siap untuk menghindari jendela kosong sesaat.
  window.once('ready-to-show', () => window.show())

  void window.loadURL(rendererUrl)
  return window
}
