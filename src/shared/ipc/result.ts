// Bentuk balasan setiap kanal IPC. Error tidak dilempar melewati batas IPC
// (Electron menghilangkan detailnya), melainkan dikembalikan sebagai data.

export const ERROR_CODES = [
  'VALIDATION',
  'NOT_FOUND',
  'LIMIT',
  'CONFLICT',
  'IO',
  'FORBIDDEN',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ResultError {
  code: ErrorCode
  // Pesan berbahasa Inggris yang aman ditampilkan ke pengguna
  message: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ResultError }
