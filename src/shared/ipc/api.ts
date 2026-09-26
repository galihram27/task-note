// Bentuk API yang diekspos preload ke renderer sebagai `window.api`.
// Mulai Tahap 2 diperluas dengan fungsi per kanal IPC dari channels.ts.
export interface Api {
  readonly platform: string
}
