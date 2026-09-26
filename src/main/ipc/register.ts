import { ipcMain } from 'electron'
import type { InvokeChannel } from '@shared/ipc/channels'
import { dispatch, type ChannelHandler, type DispatchOptions } from './dispatch'

export type RegisterHandler = <C extends InvokeChannel>(
  channel: C,
  handler: ChannelHandler<C>,
) => void

// Buat fungsi `handle()` yang mendaftarkan handler ke ipcMain. Setiap pesan melewati
// `dispatch` (cek pengirim + validasi Zod + Result), jadi handler cukup berisi logika.
export function createIpcRegistrar(options: DispatchOptions): RegisterHandler {
  return (channel, handler) => {
    ipcMain.handle(channel, (event, rawInput: unknown) => {
      const frame = event.senderFrame
      return dispatch(
        channel,
        {
          frameUrl: frame?.url ?? null,
          isMainFrame: frame !== null && frame === event.sender.mainFrame,
        },
        rawInput,
        handler,
        options,
      )
    })
  }
}
