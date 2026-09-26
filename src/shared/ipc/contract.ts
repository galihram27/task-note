import { z } from 'zod'
import type { InvokeChannel } from './channels'

// Kontrak setiap kanal IPC: skema input (divalidasi di main) dan tipe output.
// Renderer hanya memakai tipenya (import type), jadi Zod tidak ikut ke bundle renderer.

// Key pengaturan yang boleh dibaca dan ditulis renderer. Key lain (window.*, backup.*, todo.*)
// hanya diubah oleh main atau lewat kanal khusus domainnya.
export const UI_SETTING_KEYS = ['ui.lastRoute', 'ui.lastNotesFolder'] as const
export type UiSettingKey = (typeof UI_SETTING_KEYS)[number]

export const settingsGetInput = z.strictObject({
  key: z.enum(UI_SETTING_KEYS),
})

export const settingsSetInput = z.strictObject({
  key: z.enum(UI_SETTING_KEYS),
  value: z.string().max(300),
})

export interface AppInfo {
  version: string
  dbPath: string
  userDataPath: string
}

export const contract = {
  'settings:get': { input: settingsGetInput },
  'settings:set': { input: settingsSetInput },
  'app:getInfo': { input: z.void() },
} satisfies Record<InvokeChannel, { input: z.ZodType }>

// Tipe output per kanal. Harus lengkap untuk setiap kanal di INVOKE_CHANNELS.
export interface ChannelOutputs {
  'settings:get': string | null
  'settings:set': void
  'app:getInfo': AppInfo
}

export type ChannelInput<C extends InvokeChannel> = z.input<(typeof contract)[C]['input']>
export type ParsedChannelInput<C extends InvokeChannel> = z.output<(typeof contract)[C]['input']>
export type ChannelOutput<C extends InvokeChannel> = ChannelOutputs[C]
