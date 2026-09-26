// Halaman sementara untuk Tahap 1. Kerangka aplikasi (sidebar, route) dibuat di Tahap 3.
export function App() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <section className="w-full max-w-md rounded-xl border border-line bg-panel p-8">
        <p className="text-xs font-semibold tracking-widest text-accent-text uppercase">TaskNote</p>
        <h1 className="mt-2 text-2xl font-bold">Project setup complete</h1>
        <p className="mt-3 text-sm text-fg-muted">
          Window, security baseline, theme, and font are ready. The app shell comes next.
        </p>
        <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/5 rounded-full bg-accent" />
        </div>
      </section>
    </main>
  )
}
