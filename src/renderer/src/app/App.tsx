import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc/contract'
import { api } from '../lib/api'

type InfoState =
  { status: 'loading' } | { status: 'ready'; info: AppInfo } | { status: 'error'; message: string }

// Halaman sementara. Kerangka aplikasi (sidebar, route) dibuat di Tahap 3.
// Untuk sementara menampilkan info database sebagai bukti jalur IPC berfungsi.
export function App() {
  const [state, setState] = useState<InfoState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    api.app
      .getInfo()
      .then((info) => !cancelled && setState({ status: 'ready', info }))
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <section className="w-full max-w-lg rounded-xl border border-line bg-panel p-8">
        <p className="text-xs font-semibold tracking-widest text-accent-text uppercase">TaskNote</p>
        <h1 className="mt-2 text-2xl font-bold">Database ready</h1>
        {state.status === 'loading' && <p className="mt-3 text-sm text-fg-muted">Connecting…</p>}
        {state.status === 'error' && (
          <p role="alert" className="mt-3 text-sm text-accent-text">
            {state.message}
          </p>
        )}
        {state.status === 'ready' && (
          <dl className="mt-4 space-y-2 text-sm">
            <div>
              <dt className="text-fg-muted">Version</dt>
              <dd>{state.info.version}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Database</dt>
              <dd className="break-all">{state.info.dbPath}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  )
}
