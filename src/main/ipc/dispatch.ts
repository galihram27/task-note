import { z } from 'zod'
import type { InvokeChannel } from '@shared/ipc/channels'
import { contract, type ChannelOutput, type ParsedChannelInput } from '@shared/ipc/contract'
import type { ErrorCode, Result, ResultError } from '@shared/ipc/result'
import { isAppUrl, type AppUrlOptions } from '../appUrl'
import { AppError } from '../errors'

// Inti pemrosesan pesan IPC, terpisah dari `ipcMain` agar bisa diuji tanpa Electron.
// Urutan: verifikasi pengirim → validasi Zod → jalankan handler → bungkus hasil jadi Result.

export type ChannelHandler<C extends InvokeChannel> = (
  input: ParsedChannelInput<C>,
) => ChannelOutput<C> | Promise<ChannelOutput<C>>

export interface IpcSender {
  // URL frame pengirim; null jika frame sudah dihancurkan
  frameUrl: string | null
  // Hanya frame utama jendela aplikasi yang boleh memanggil API
  isMainFrame: boolean
}

export interface DispatchOptions {
  appUrls: AppUrlOptions
  // Dipanggil untuk error tak terduga (detail tidak dikirim ke renderer)
  onUnexpectedError?: (channel: InvokeChannel, error: unknown) => void
}

export async function dispatch<C extends InvokeChannel>(
  channel: C,
  sender: IpcSender,
  rawInput: unknown,
  handler: ChannelHandler<C>,
  options: DispatchOptions,
): Promise<Result<ChannelOutput<C>>> {
  if (!sender.isMainFrame || !sender.frameUrl || !isAppUrl(sender.frameUrl, options.appUrls)) {
    return fail('FORBIDDEN', 'This request is not allowed.')
  }

  const parsed = contract[channel].input.safeParse(rawInput)
  if (!parsed.success) {
    return fail('VALIDATION', describeValidationError(parsed.error))
  }

  try {
    const data = await handler(parsed.data as ParsedChannelInput<C>)
    return { ok: true, data }
  } catch (error) {
    if (error instanceof AppError) return fail(error.code, error.message)
    options.onUnexpectedError?.(channel, error)
    return fail('INTERNAL', 'Something went wrong. Please try again.')
  }
}

function fail(code: ErrorCode, message: string): { ok: false; error: ResultError } {
  return { ok: false, error: { code, message } }
}

// Ringkas error Zod menjadi satu kalimat berbahasa Inggris, mis. "Invalid input at value: ..."
function describeValidationError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid input.'
  // Contoh hasil: "value: Invalid input: expected string, received number"
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
}
