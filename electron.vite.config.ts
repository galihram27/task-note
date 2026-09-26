import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import { buildCsp } from './src/main/csp'

const sharedAlias = { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) }

// Menyisipkan meta CSP ke index.html. Mode dev sedikit dilonggarkan untuk HMR,
// build produksi selalu memakai kebijakan ketat.
function cspPlugin(): Plugin {
  let mode: 'production' | 'development' = 'production'
  return {
    name: 'tasknote-csp',
    configResolved(config) {
      mode = config.command === 'serve' ? 'development' : 'production'
    },
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp(mode) },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
  },
  preload: {
    resolve: { alias: sharedAlias },
  },
  renderer: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      },
    },
    // Jangan inline aset sebagai data: URI (mis. subset font kecil) karena CSP `font-src 'self'`
    // akan memblokirnya. Semua aset tetap berupa file lokal.
    build: { assetsInlineLimit: 0 },
    plugins: [cspPlugin(), react(), tailwindcss()],
  },
})
