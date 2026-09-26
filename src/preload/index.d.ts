import type { Api } from '@shared/ipc/api'

// Deklarasi global agar renderer mengenal tipe `window.api`.
declare global {
  interface Window {
    readonly api: Api
  }
}

export {}
