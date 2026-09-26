import { addDays, format, isValid, parse } from 'date-fns'

// Semua tanggal harian disimpan sebagai string `YYYY-MM-DD` menurut zona waktu lokal
// sistem (bukan UTC). String ini bisa dibandingkan langsung secara leksikografis.
export type DateKey = string

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/
const DATE_KEY_FORMAT = 'yyyy-MM-dd'

// Ubah instan waktu menjadi tanggal lokal. Satu-satunya cara resmi membuat DateKey.
export function toDateKey(date: Date): DateKey {
  return format(date, DATE_KEY_FORMAT)
}

// Parse DateKey menjadi Date pada tengah malam waktu lokal.
// Melempar error jika format atau tanggalnya tidak valid (mis. 2026-02-30).
export function parseDateKey(key: DateKey): Date {
  if (!isValidDateKey(key)) throw new Error(`Invalid date key: ${key}`)
  return parse(key, DATE_KEY_FORMAT, new Date())
}

// Valid jika formatnya tepat `YYYY-MM-DD` dan tanggalnya benar-benar ada.
export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_PATTERN.test(key)) return false
  const date = parse(key, DATE_KEY_FORMAT, new Date())
  // Round-trip memastikan tidak ada normalisasi diam-diam (mis. 31 April → 1 Mei).
  return isValid(date) && format(date, DATE_KEY_FORMAT) === key
}

// Geser tanggal sejumlah hari kalender. Memakai aritmetika kalender (bukan +24 jam)
// sehingga aman saat pergantian DST.
export function addDaysKey(key: DateKey, days: number): DateKey {
  return toDateKey(addDays(parseDateKey(key), days))
}

// True jika `key` berada setelah `todayKey`.
export function isFutureKey(key: DateKey, todayKey: DateKey): boolean {
  return key > todayKey
}

export interface MonthRange {
  // Tanggal pertama bulan tersebut (inklusif)
  start: DateKey
  // Tanggal pertama bulan berikutnya (eksklusif), untuk query `date >= start AND date < end`
  endExclusive: DateKey
}

// Rentang tanggal untuk satu bulan `YYYY-MM`, dipakai query penanda kalender.
export function monthRange(month: string): MonthRange {
  if (!MONTH_KEY_PATTERN.test(month)) throw new Error(`Invalid month key: ${month}`)
  const start = `${month}-01`
  if (!isValidDateKey(start)) throw new Error(`Invalid month key: ${month}`)
  const [year, monthNumber] = month.split('-').map(Number) as [number, number]
  const next =
    monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`
  return { start, endExclusive: `${next}-01` }
}
