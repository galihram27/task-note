import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseHandle } from '../client'
import { applyMigrationsSync } from '../migrate'
import { createTestDb, MIGRATIONS_FOLDER } from './testDb'

const NOW = '2026-09-26T01:00:00.000Z'

let handle: DatabaseHandle
beforeEach(() => {
  handle = createTestDb()
})
afterEach(() => {
  handle.sqlite.close()
})

function names(type: 'table' | 'index' | 'trigger'): string[] {
  return (
    handle.sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type = ? ORDER BY name`)
      .all(type) as { name: string }[]
  ).map((row) => row.name)
}

function insertTask(values: {
  title?: string
  parentId?: number | null
  position?: string
}): number {
  const result = handle.sqlite
    .prepare(
      `INSERT INTO tasks (title, parent_id, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(values.title ?? 'Task', values.parentId ?? null, values.position ?? 'a0', NOW, NOW)
  return Number(result.lastInsertRowid)
}

function insertFolder(name: string, parentId: number | null): number {
  const result = handle.sqlite
    .prepare(
      `INSERT INTO folders (name, parent_id, position, created_at, updated_at) VALUES (?, ?, 'a0', ?, ?)`,
    )
    .run(name, parentId, NOW, NOW)
  return Number(result.lastInsertRowid)
}

function insertNote(title: string, contentText: string): number {
  const result = handle.sqlite
    .prepare(`INSERT INTO notes (title, content_text, created_at, updated_at) VALUES (?, ?, ?, ?)`)
    .run(title, contentText, NOW, NOW)
  return Number(result.lastInsertRowid)
}

function searchNotes(query: string): number[] {
  return (
    handle.sqlite
      .prepare(`SELECT rowid FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rowid`)
      .all(query) as { rowid: number }[]
  ).map((row) => row.rowid)
}

describe('migrations', () => {
  it('create every table, index, trigger, and the FTS5 table', () => {
    expect(names('table')).toEqual(
      expect.arrayContaining([
        'tasks',
        'task_history',
        'time_entries',
        'folders',
        'notes',
        'settings',
        'notes_fts',
        '__drizzle_migrations',
      ]),
    )
    expect(names('index')).toEqual(
      expect.arrayContaining([
        'tasks_parent_position_uq',
        'tasks_only_for_date_idx',
        'tasks_checked_date_idx',
        'task_history_date_task_uq',
        'task_history_date_idx',
        'time_entries_date_idx',
        'folders_parent_position_uq',
        'notes_folder_idx',
        'notes_deleted_at_idx',
      ]),
    )
    expect(names('trigger')).toEqual([
      'folders_max_depth_ins',
      'notes_fts_ad',
      'notes_fts_ai',
      'notes_fts_au',
      'tasks_max_depth_ins',
      'tasks_max_depth_upd',
    ])
    const fts = handle.sqlite
      .prepare(`SELECT sql FROM sqlite_master WHERE name = 'notes_fts'`)
      .get() as { sql: string }
    expect(fts.sql).toContain('USING fts5')
  })

  it('are idempotent when run twice', () => {
    expect(() => applyMigrationsSync(handle, MIGRATIONS_FOLDER)).not.toThrow()
    const count = handle.sqlite.prepare(`SELECT count(*) AS n FROM __drizzle_migrations`).get() as {
      n: number
    }
    expect(count.n).toBe(2)
  })

  it('enable foreign keys on the connection', () => {
    expect(handle.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
  })
})

describe('tasks constraints', () => {
  it('allow one level of subtasks but reject a second level', () => {
    const parent = insertTask({ title: 'Parent' })
    const child = insertTask({ title: 'Child', parentId: parent })
    expect(() => insertTask({ title: 'Grandchild', parentId: child })).toThrow(/TASK_DEPTH/)
  })

  it('reject moving a task that has subtasks under another task', () => {
    const a = insertTask({ title: 'A', position: 'a0' })
    const b = insertTask({ title: 'B', position: 'a1' })
    insertTask({ title: 'B child', parentId: b })
    expect(() =>
      handle.sqlite.prepare(`UPDATE tasks SET parent_id = ? WHERE id = ?`).run(a, b),
    ).toThrow(/TASK_DEPTH/)
  })

  it('reject blank titles, out-of-range estimates, and inconsistent check state', () => {
    expect(() => insertTask({ title: '   ' })).toThrow(/CHECK/)
    expect(() =>
      handle.sqlite
        .prepare(
          `INSERT INTO tasks (title, position, estimate_minutes, created_at, updated_at) VALUES ('T', 'a0', 0, ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/)
    expect(() =>
      handle.sqlite
        .prepare(
          `INSERT INTO tasks (title, position, is_checked, created_at, updated_at) VALUES ('T', 'a0', 1, ?, ?)`,
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/)
  })

  it('only allow "today only" on top-level tasks', () => {
    const parent = insertTask({ title: 'Parent' })
    expect(() =>
      handle.sqlite
        .prepare(
          `INSERT INTO tasks (title, parent_id, position, only_for_date, created_at, updated_at) VALUES ('C', ?, 'a0', '2026-09-26', ?, ?)`,
        )
        .run(parent, NOW, NOW),
    ).toThrow(/CHECK/)
  })

  it('cascade deletes to subtasks and keep time entries with a null task', () => {
    const parent = insertTask({ title: 'Parent' })
    insertTask({ title: 'Child', parentId: parent })
    handle.sqlite
      .prepare(
        `INSERT INTO time_entries (date, minutes, task_id, task_title, created_at) VALUES ('2026-09-26', 30, ?, 'Parent', ?)`,
      )
      .run(parent, NOW)
    handle.sqlite.prepare(`DELETE FROM tasks WHERE id = ?`).run(parent)

    expect(handle.sqlite.prepare(`SELECT count(*) AS n FROM tasks`).get()).toEqual({ n: 0 })
    expect(handle.sqlite.prepare(`SELECT task_id, task_title FROM time_entries`).get()).toEqual({
      task_id: null,
      task_title: 'Parent',
    })
  })

  it('keep history rows when their task is deleted (no foreign key)', () => {
    const task = insertTask({ title: 'Workout' })
    handle.sqlite
      .prepare(
        `INSERT INTO task_history (date, task_id, title, checked_at) VALUES ('2026-09-26', ?, 'Workout', ?)`,
      )
      .run(task, NOW)
    handle.sqlite.prepare(`DELETE FROM tasks WHERE id = ?`).run(task)
    expect(handle.sqlite.prepare(`SELECT title FROM task_history`).get()).toEqual({
      title: 'Workout',
    })
  })
})

describe('folders constraints', () => {
  it('allow three levels and reject a fourth', () => {
    const level1 = insertFolder('Study', null)
    const level2 = insertFolder('Semester 5', level1)
    const level3 = insertFolder('Databases', level2)
    expect(() => insertFolder('Too deep', level3)).toThrow(/FOLDER_DEPTH/)
  })

  it('move notes to "unfiled" when their folder is deleted', () => {
    const folder = insertFolder('Study', null)
    const note = insertNote('Exam plan', 'monday')
    handle.sqlite.prepare(`UPDATE notes SET folder_id = ? WHERE id = ?`).run(folder, note)
    handle.sqlite.prepare(`DELETE FROM folders WHERE id = ?`).run(folder)
    expect(handle.sqlite.prepare(`SELECT folder_id FROM notes WHERE id = ?`).get(note)).toEqual({
      folder_id: null,
    })
  })
})

describe('notes FTS5 index', () => {
  it('stays in sync on insert, update, and delete', () => {
    const first = insertNote('Normalization summary', 'first normal form removes repeating groups')
    const second = insertNote('Exam schedule', 'Monday databases, Wednesday networks')

    expect(searchNotes('normal*')).toEqual([first])
    expect(searchNotes('databases')).toEqual([second])

    handle.sqlite
      .prepare(`UPDATE notes SET content_text = 'Monday algorithms' WHERE id = ?`)
      .run(second)
    expect(searchNotes('databases')).toEqual([])
    expect(searchNotes('algorithms')).toEqual([second])

    handle.sqlite.prepare(`DELETE FROM notes WHERE id = ?`).run(first)
    expect(searchNotes('normal*')).toEqual([])

    expect(() =>
      handle.sqlite.prepare(`INSERT INTO notes_fts(notes_fts) VALUES ('integrity-check')`).run(),
    ).not.toThrow()
  })

  it('matches words regardless of diacritics', () => {
    const note = insertNote('Café notes', 'résumé draft')
    expect(searchNotes('cafe')).toEqual([note])
    expect(searchNotes('resume')).toEqual([note])
  })
})
