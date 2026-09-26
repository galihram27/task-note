import { sql } from 'drizzle-orm'
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// Skema database TaskNote (lihat docs/PLAN.md §4).
// Nama kolom TS camelCase otomatis menjadi snake_case (casing: 'snake_case').
// Kolom waktu instan berisi ISO 8601 UTC; kolom tanggal harian berisi `YYYY-MM-DD` lokal.
// Tabel virtual FTS5 dan trigger dibuat lewat migrasi custom karena Drizzle tidak mendukungnya.

// Daily reusable list: list utama dan sub list (maksimal 1 tingkat) beserta status centang saat ini.
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    parentId: integer().references((): AnySQLiteColumn => tasks.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    // null = tanpa estimasi
    estimateMinutes: integer(),
    // Kunci fractional indexing, unik per induk
    position: text().notNull(),
    isChecked: integer({ mode: 'boolean' }).notNull().default(false),
    checkedAt: text(),
    checkedDate: text(),
    // Diisi untuk item "Today only"; null = muncul setiap hari
    onlyForDate: text(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
    // Hanya untuk undo hapus; di-purge saat aplikasi dibuka
    deletedAt: text(),
  },
  (t) => [
    uniqueIndex('tasks_parent_position_uq').on(t.parentId, t.position),
    index('tasks_only_for_date_idx').on(t.onlyForDate),
    index('tasks_checked_date_idx').on(t.checkedDate),
    check('tasks_title_len', sql`length(trim(${t.title})) between 1 and 200`),
    check(
      'tasks_estimate',
      sql`${t.estimateMinutes} is null or ${t.estimateMinutes} between 1 and 1440`,
    ),
    check(
      'tasks_checked_consistent',
      sql`(${t.isChecked} = 1 and ${t.checkedAt} is not null and ${t.checkedDate} is not null) or (${t.isChecked} = 0 and ${t.checkedAt} is null and ${t.checkedDate} is null)`,
    ),
    check('tasks_only_for_root', sql`${t.onlyForDate} is null or ${t.parentId} is null`),
  ],
)

// Snapshot item yang dicentang per tanggal. Kolom ID sengaja tanpa FK agar histori tetap utuh
// walaupun task diedit, dihapus, atau di-purge.
export const taskHistory = sqliteTable(
  'task_history',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    date: text().notNull(),
    taskId: integer().notNull(),
    // null = entri list utama
    parentTaskId: integer(),
    title: text().notNull(),
    parentTitle: text(),
    // Jumlah sub list milik induk saat item dicentang
    parentSubtaskTotal: integer(),
    checkedAt: text().notNull(),
  },
  (t) => [
    uniqueIndex('task_history_date_task_uq').on(t.date, t.taskId),
    index('task_history_date_idx').on(t.date),
  ],
)

// Catatan waktu per tanggal, opsional tertaut ke list utama (judulnya disimpan sebagai snapshot).
export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    date: text().notNull(),
    minutes: integer().notNull(),
    note: text(),
    taskId: integer().references(() => tasks.id, { onDelete: 'set null' }),
    taskTitle: text(),
    // Juga dipakai sebagai "jam dicatat"
    createdAt: text().notNull(),
    // Hanya untuk undo hapus
    deletedAt: text(),
  },
  (t) => [
    index('time_entries_date_idx').on(t.date),
    check('time_entries_minutes', sql`${t.minutes} between 1 and 1440`),
    check('time_entries_note_len', sql`${t.note} is null or length(${t.note}) <= 200`),
  ],
)

// Pohon folder catatan (maksimal 3 tingkat), diurutkan per induk.
export const folders = sqliteTable(
  'folders',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    parentId: integer().references((): AnySQLiteColumn => folders.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    position: text().notNull(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
  },
  (t) => [
    uniqueIndex('folders_parent_position_uq').on(t.parentId, t.position),
    check('folders_name_len', sql`length(trim(${t.name})) between 1 and 80`),
  ],
)

// Catatan rich text. `contentText` selalu dihitung di main dari `contentJson` untuk indeks FTS5.
export const notes = sqliteTable(
  'notes',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    folderId: integer().references(() => folders.id, { onDelete: 'set null' }),
    title: text().notNull().default(''),
    contentJson: text().notNull().default('{"type":"doc","content":[]}'),
    contentText: text().notNull().default(''),
    isPinned: integer({ mode: 'boolean' }).notNull().default(false),
    pinnedAt: text(),
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
    // Terisi = catatan berada di Sampah
    deletedAt: text(),
  },
  (t) => [
    index('notes_folder_idx').on(t.deletedAt, t.folderId, t.updatedAt),
    index('notes_deleted_at_idx').on(t.deletedAt),
  ],
)

// Key-value JSON untuk pengaturan dan state UI. Bentuk nilai divalidasi Zod per key.
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: text().notNull(),
})
