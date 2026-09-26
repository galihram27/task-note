import type { ErrorCode } from '@shared/ipc/result'

// Error yang boleh sampai ke renderer. `message` harus berbahasa Inggris dan aman
// ditampilkan ke pengguna. Error lain dianggap INTERNAL dan pesannya disembunyikan.
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}
