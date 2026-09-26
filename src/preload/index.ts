import { contextBridge } from 'electron'
import type { Api } from '@shared/ipc/api'

// Preload berjalan di sandbox: hanya boleh mengimpor `electron` dan kode lokal tanpa
// dependensi npm. Kanal IPC bertipe ditambahkan mulai Tahap 2 lewat daftar di
// src/shared/ipc/channels.ts.
const api: Api = Object.freeze({
  platform: process.platform,
})

contextBridge.exposeInMainWorld('api', api)
