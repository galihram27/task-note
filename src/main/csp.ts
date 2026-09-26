// Content Security Policy untuk renderer. Modul ini murni (tanpa import electron)
// agar bisa dipakai oleh electron.vite.config.ts dan diuji langsung dengan Vitest.

export type CspMode = 'production' | 'development'

type Directives = Record<string, string[]>

// Kebijakan produksi: semua resource hanya dari paket aplikasi sendiri, tanpa sumber remote.
// `style-src 'unsafe-inline'` dibutuhkan untuk atribut style inline (mis. transform dari dnd-kit).
const productionDirectives: Directives = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'font-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-src': ["'none'"],
}

// Tambahan khusus mode dev: preamble React Refresh berupa inline script,
// dan HMR Vite membutuhkan koneksi WebSocket ke dev server lokal.
const developmentAdditions: Directives = {
  'script-src': ["'unsafe-inline'"],
  'connect-src': ['ws://localhost:*', 'http://localhost:*'],
}

export function buildCsp(mode: CspMode): string {
  const directives: Directives = structuredClone(productionDirectives)
  if (mode === 'development') {
    for (const [name, sources] of Object.entries(developmentAdditions)) {
      directives[name] = [...(directives[name] ?? []), ...sources]
    }
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}
