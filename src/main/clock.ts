// Sumber waktu yang bisa diganti. Service menerima Clock sebagai parameter agar test
// bisa mengatur "sekarang" (mis. melewati tengah malam) tanpa memanipulasi jam sistem.
export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

// Clock beku untuk test. Terima string ISO dengan offset, mis. '2026-09-24T22:30:00+07:00'.
export function fixedClock(iso: string): Clock & { set(iso: string): void } {
  let current = new Date(iso)
  if (Number.isNaN(current.getTime())) throw new Error(`Invalid ISO date: ${iso}`)
  return {
    now: () => new Date(current.getTime()),
    set(next: string) {
      current = new Date(next)
    },
  }
}
