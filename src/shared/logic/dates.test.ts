import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addDaysKey,
  isFutureKey,
  isValidDateKey,
  monthRange,
  parseDateKey,
  toDateKey,
} from './dates'

// Jalankan skenario yang bergantung zona waktu dengan TZ tertentu.
// Node membaca ulang process.env.TZ saat nilainya diubah.
function withTimeZone(timeZone: string, run: () => void): void {
  describe(`TZ=${timeZone}`, () => {
    const original = process.env.TZ
    beforeAll(() => {
      process.env.TZ = timeZone
    })
    afterAll(() => {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    })
    run()
  })
}

describe('toDateKey', () => {
  it('uses the local calendar date around midnight', () => {
    expect(toDateKey(new Date(2026, 8, 24, 23, 59, 59))).toBe('2026-09-24')
    expect(toDateKey(new Date(2026, 8, 25, 0, 0, 0))).toBe('2026-09-25')
  })

  it('handles month and year boundaries', () => {
    expect(toDateKey(new Date(2026, 0, 31, 12))).toBe('2026-01-31')
    expect(toDateKey(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31')
    expect(toDateKey(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01')
  })
})

withTimeZone('Asia/Jakarta', () => {
  it('maps a UTC instant to the local (UTC+7) date', () => {
    // 17:30 UTC = 00:30 WIB keesokan harinya
    expect(toDateKey(new Date('2026-09-24T17:30:00Z'))).toBe('2026-09-25')
    expect(toDateKey(new Date('2026-09-24T16:59:59Z'))).toBe('2026-09-24')
  })
})

withTimeZone('Europe/Berlin', () => {
  it('maps a UTC instant to the local (UTC+2 in summer) date', () => {
    expect(toDateKey(new Date('2026-09-24T17:30:00Z'))).toBe('2026-09-24')
    expect(toDateKey(new Date('2026-09-24T22:30:00Z'))).toBe('2026-09-25')
  })

  it('adds calendar days across DST transitions', () => {
    // DST mulai 29 Maret 2026 (hari 23 jam) dan berakhir 25 Oktober 2026 (hari 25 jam).
    expect(addDaysKey('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDaysKey('2026-03-29', 1)).toBe('2026-03-30')
    expect(addDaysKey('2026-10-25', 1)).toBe('2026-10-26')
    expect(addDaysKey('2026-10-26', -1)).toBe('2026-10-25')
  })
})

describe('isValidDateKey', () => {
  it('accepts real dates in YYYY-MM-DD format', () => {
    expect(isValidDateKey('2026-09-24')).toBe(true)
    expect(isValidDateKey('2028-02-29')).toBe(true)
  })

  it('rejects impossible dates and wrong formats', () => {
    expect(isValidDateKey('2026-02-29')).toBe(false)
    expect(isValidDateKey('2026-04-31')).toBe(false)
    expect(isValidDateKey('2026-13-01')).toBe(false)
    expect(isValidDateKey('2026-9-1')).toBe(false)
    expect(isValidDateKey('24-09-2026')).toBe(false)
    expect(isValidDateKey('')).toBe(false)
  })
})

describe('parseDateKey', () => {
  it('returns local midnight of that date', () => {
    const date = parseDateKey('2026-09-24')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(24)
    expect(date.getHours()).toBe(0)
  })

  it('throws on invalid keys', () => {
    expect(() => parseDateKey('2026-02-30')).toThrow()
  })
})

describe('addDaysKey', () => {
  it('moves across month, year, and leap-day boundaries', () => {
    expect(addDaysKey('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysKey('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysKey('2026-09-25', -6)).toBe('2026-09-19')
  })
})

describe('isFutureKey', () => {
  it('compares against today', () => {
    expect(isFutureKey('2026-09-26', '2026-09-25')).toBe(true)
    expect(isFutureKey('2026-09-25', '2026-09-25')).toBe(false)
    expect(isFutureKey('2025-12-31', '2026-01-01')).toBe(false)
  })
})

describe('monthRange', () => {
  it('returns an inclusive start and exclusive end', () => {
    expect(monthRange('2026-09')).toEqual({ start: '2026-09-01', endExclusive: '2026-10-01' })
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' })
  })

  it('rejects invalid months', () => {
    expect(() => monthRange('2026-13')).toThrow()
    expect(() => monthRange('2026-9')).toThrow()
  })
})
