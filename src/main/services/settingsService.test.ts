import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fixedClock } from '../clock'
import type { DatabaseHandle } from '../db/client'
import { createTestDb } from '../db/__tests__/testDb'
import { AppError } from '../errors'
import { getSetting, setSetting } from './settingsService'

let handle: DatabaseHandle
const clock = fixedClock('2026-09-26T08:00:00Z')

beforeEach(() => {
  handle = createTestDb()
})
afterEach(() => {
  handle.sqlite.close()
})

describe('settingsService', () => {
  it('returns null for settings that were never saved', () => {
    expect(getSetting(handle.db, 'ui.lastRoute')).toBeNull()
  })

  it('round-trips values of different shapes', () => {
    setSetting(handle.db, clock, 'ui.lastRoute', '/notes/all')
    setSetting(handle.db, clock, 'window.bounds', {
      x: 10,
      y: 20,
      width: 1280,
      height: 800,
      isMaximized: false,
    })
    setSetting(handle.db, clock, 'backup.dir', null)
    setSetting(handle.db, clock, 'todo.resetBannerDismissedDate', '2026-09-26')

    expect(getSetting(handle.db, 'ui.lastRoute')).toBe('/notes/all')
    expect(getSetting(handle.db, 'window.bounds')).toEqual({
      x: 10,
      y: 20,
      width: 1280,
      height: 800,
      isMaximized: false,
    })
    expect(getSetting(handle.db, 'backup.dir')).toBeNull()
    expect(getSetting(handle.db, 'todo.resetBannerDismissedDate')).toBe('2026-09-26')
  })

  it('overwrites an existing value and updates the timestamp', () => {
    setSetting(handle.db, clock, 'ui.lastRoute', '/todo/manage')
    const later = fixedClock('2026-09-27T09:00:00Z')
    setSetting(handle.db, later, 'ui.lastRoute', '/settings')

    expect(getSetting(handle.db, 'ui.lastRoute')).toBe('/settings')
    expect(
      handle.sqlite.prepare(`SELECT updated_at FROM settings WHERE key = 'ui.lastRoute'`).get(),
    ).toEqual({
      updated_at: '2026-09-27T09:00:00.000Z',
    })
  })

  it('rejects invalid values with a VALIDATION error', () => {
    expect(() =>
      setSetting(handle.db, clock, 'todo.resetBannerDismissedDate', '2026-02-30'),
    ).toThrow(AppError)
    try {
      setSetting(handle.db, clock, 'ui.lastRoute', 'x'.repeat(301))
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('VALIDATION')
    }
  })

  it('returns null instead of crashing when the stored value is corrupt', () => {
    handle.sqlite
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('ui.lastRoute', '{not json', ?)`,
      )
      .run('2026-09-26T08:00:00Z')
    handle.sqlite
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('backup.enabled', '"yes"', ?)`,
      )
      .run('2026-09-26T08:00:00Z')

    expect(getSetting(handle.db, 'ui.lastRoute')).toBeNull()
    expect(getSetting(handle.db, 'backup.enabled')).toBeNull()
  })
})
