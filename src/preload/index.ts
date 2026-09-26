import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/ipc/api'
import { INVOKE_CHANNELS } from '@shared/ipc/channels'

// Preload berjalan di sandbox: hanya boleh mengimpor `electron` dan kode lokal tanpa
// dependensi npm. `ipcRenderer` tidak pernah diekspos langsung; renderer hanya mendapat
// satu fungsi per kanal yang terdaftar di INVOKE_CHANNELS.
function buildInvokeApi(): Record<string, Record<string, (input?: unknown) => Promise<unknown>>> {
  const api: Record<string, Record<string, (input?: unknown) => Promise<unknown>>> = {}
  for (const channel of INVOKE_CHANNELS) {
    const [domain, action] = channel.split(':') as [string, string]
    const domainApi = (api[domain] ??= {})
    domainApi[action] = (input?: unknown) => ipcRenderer.invoke(channel, input)
  }
  return api
}

const api = Object.freeze({
  ...buildInvokeApi(),
  platform: process.platform,
}) as unknown as Api

contextBridge.exposeInMainWorld('api', api)
