// Penentuan apakah sebuah URL milik aplikasi sendiri. Dipakai untuk memblokir
// navigasi ke luar dan (mulai Tahap 2) memverifikasi pengirim pesan IPC.
// Modul ini murni (tanpa import electron) agar mudah diuji.

export interface AppUrlOptions {
  // URL dev server Vite (hanya ada saat `npm run dev`), mis. http://localhost:5173
  devServerUrl?: string
  // URL file:// dari index.html renderer hasil build
  indexFileUrl: string
}

export function isAppUrl(rawUrl: string, options: AppUrlOptions): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (options.devServerUrl) {
    const dev = new URL(options.devServerUrl)
    if (url.origin === dev.origin) return true
  }

  // Untuk file://, hanya index.html aplikasi yang dianggap sah (hash route boleh berbeda).
  const index = new URL(options.indexFileUrl)
  return url.protocol === 'file:' && url.pathname === index.pathname
}

// Hanya tautan http(s) yang boleh dibuka di browser default.
export function isExternalHttpUrl(rawUrl: string): boolean {
  try {
    const { protocol } = new URL(rawUrl)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
