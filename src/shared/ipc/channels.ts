// Daftar kanal IPC yang diizinkan. File ini sengaja tanpa dependensi apa pun karena
// diimpor oleh preload yang berjalan di sandbox. Format nama: `domain:action`.
export const INVOKE_CHANNELS = ['settings:get', 'settings:set', 'app:getInfo'] as const

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number]
