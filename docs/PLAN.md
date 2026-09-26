# TaskNote — Rencana Teknis

Status: rencana v1 (25 September 2026). Belum ada kode.
Dokumen ini adalah sumber kebenaran untuk arsitektur, skema, kontrak IPC, aturan bisnis,
dan tahapan. `CLAUDE.md` berisi ringkasan permanennya.

**Keputusan hasil klarifikasi**
- Perubahan list bersifat permanen. Selain itu ada item **"Today only"** (list utama sekali
  pakai) yang tidak lagi tampil mulai hari berikutnya.
- Catatan waktu boleh **ditautkan secara opsional** ke satu list utama. Judulnya disimpan sebagai snapshot.
- Membatalkan centang item yang dicentang pada hari sebelumnya **tidak mengubah histori** hari itu.
- Package manager: **npm**.
- **Bahasa:** seluruh UI berbahasa Inggris (locale `en-US`, jam 12-jam, minggu dimulai Senin). Nama folder, file, variabel,
  objek, class, dan fungsi berbahasa Inggris. Komentar kode berbahasa Indonesia. Nama produk: **TaskNote**.

---

## 1. Arsitektur

### 1.1 Pembagian tanggung jawab

| Proses | Tanggung jawab | Tidak boleh |
|---|---|---|
| **Main** (Node) | Siklus hidup aplikasi, jendela (ukuran/posisi), keamanan (CSP, navigasi, permission), koneksi SQLite, migrasi, semua logika data (service), validasi Zod untuk setiap IPC, dialog file, backup/ekspor/impor, purge terjadwal, dan menghitung "hari ini" secara otoritatif | Merender UI |
| **Preload** (sandboxed) | Mengekspos `window.api` bertipe lewat `contextBridge`. Setiap fungsi hanya memanggil `ipcRenderer.invoke(<kanal yang di-whitelist>, input)`, ditambah `window.api.on(event, cb)` untuk event main→renderer yang juga di-whitelist | Mengimpor paket npm, mengekspos `ipcRenderer` mentah, atau berisi logika bisnis |
| **Renderer** (React) | UI, routing, state UI (Zustand), cache data (TanStack Query), optimistic update, shortcut keyboard, parsing input untuk pratinjau (durasi) | Mengakses Node, fs, DB, atau path file |
| **Shared** | Kontrak IPC (nama kanal, skema Zod, tipe DTO) dan logika murni (parser durasi, logika centang, progres, tanggal, aturan folder, ekstraksi teks, query FTS) | Mengimpor `electron`, Node API, atau DOM |

### 1.2 Alur data

```
Komponen React
  └─ hook (useToggleTask)            TanStack Query: onMutate → optimistic update cache
      └─ lib/api.ts                  unwrap Result → lempar AppError jika ok:false
          └─ window.api.todo.toggle(input)          [preload, contextBridge]
              └─ ipcRenderer.invoke('todo:toggle', input)
                  ══════════ IPC (structured clone) ══════════
                  main/ipc/register.ts  handle():
                    1. verifikasi event.senderFrame.url (dev URL / file:// aplikasi)
                    2. contract['todo:toggle'].input.parse(input)   (Zod)
                    3. todoService.toggle(db, clock, parsed)
                    4. tangkap error → { ok:false, error:{ code, message } }
                  └─ services/todoService.ts → Drizzle → better-sqlite3 (transaksi sinkron)
                      └─ SQLite (tasknote.db, WAL, FK ON; trigger FTS5)
              ◄── { ok:true, data } ──
          ◄── data
      onSuccess: tulis data otoritatif ke cache · onError: rollback + toast
      onSettled: invalidasi key terkait (history.day(today), history.markedDates(bulan))
```

Event main → renderer (whitelist): `app:systemResumed` (dari `powerMonitor`, untuk cek
pergantian hari), `backup:statusChanged`, `app:dataReplaced` (setelah impor, renderer
memanggil `queryClient.resetQueries()`).

### 1.3 Urutan bootstrap main

1. `app.requestSingleInstanceLock()`. Jika gagal, keluar. Instance kedua memfokuskan jendela yang sudah ada.
2. Dev: `app.setPath('userData', …'TaskNote (Dev)')`.
3. Buka DB, set pragma, lalu cek migrasi tertunda. Jika ada dan DB sudah berisi data, buat
   `db.backup()` ke `<userData>/backups/pre-migrate-<ts>.sqlite` (simpan 5 terakhir), lalu `migrate()`.
   Jika gagal, tampilkan `dialog.showErrorBox` dengan lokasi backup, lalu `app.quit()`.
4. Purge data: `tasks`/`time_entries` dengan `deleted_at` (sisa undo), tugas "Today only"
   yang tanggalnya lewat, dan catatan di sampah yang lebih dari 30 hari.
5. Daftarkan IPC, pasang keamanan sesi (CSP header, permission handler), buat jendela
   dengan bounds tersimpan.
6. Jadwalkan backup otomatis (cek saat start, lalu setiap 60 menit, serta saat resume).

---

## 2. Peta halaman dan route

Router: `createHashRouter` karena build produksi dimuat dari `file://`.

| Route | Komponen | Catatan |
|---|---|---|
| `/` | `<RestoreLastRoute>` | Redirect ke `ui.lastRoute`, atau `/todo/manage` |
| `/todo` | `TodoLayout` (tab) | Index → redirect `/todo/manage` |
| `/todo/manage` | `ManageListPage` | Sub halaman 1a |
| `/todo/history` | `ListHistoryPage` | Tanggal = hari ini |
| `/todo/history/:date` | `ListHistoryPage` | `:date` divalidasi `YYYY-MM-DD` dan tanggal nyata. Tanggal masa depan atau tidak valid → `replace` ke `/todo/history` |
| `/notes` | `NotesPage` (petak) | Akar: petak folder tingkat 1 + petak catatan tanpa folder |
| `/notes/folder/:folderId` | `NotesPage` (petak) | Isi folder: petak subfolder + catatan langsung di folder itu. Folder tidak ada → redirect `/notes` |
| `/notes/all` | `NotesPage` (petak) | Semua catatan aktif sebagai petak (tanpa petak folder) |
| `/notes/trash` | `NotesPage` (petak) | Catatan di sampah |
| `/notes/edit/:noteId` | `NoteEditorPage` | Editor satu catatan. Tidak ditemukan → redirect `/notes` |
| `/settings` | `SettingsPage` | Backup otomatis, ekspor/impor, info |
| `*` | redirect | → `/todo/manage` |

- **Ingat route terakhir:** `useLocation` dengan debounce 500 ms memanggil `settings:set({key:'ui.lastRoute'})`.
  Route `/todo/history/:date` disimpan sebagai `/todo/history` agar setelah dibuka ulang kembali ke hari ini.
- **Shortcut global** (listener `keydown` di `AppShell`):
  - Ctrl+1 → `/todo/manage`
  - Ctrl+2 → `/todo/history`
  - Ctrl+3 → lokasi Catatan terakhir (`ui.lastNotesFolder`, default `/notes`)
  - Ctrl+N → di Kelola: fokus ke input tambah list. Di Histori: pindah ke Kelola lalu fokus. Di Catatan: buat catatan di lokasi aktif (di `all`/`trash` → akar/tanpa folder) lalu buka editornya.
  - Ctrl+F → di Catatan: fokus ke kotak cari. Di halaman lain tidak melakukan apa-apa.
  - ←/→ di Histori: pindah hari, tetapi tidak aktif saat fokus berada di input, editor, atau grid kalender.
  - Di petak Catatan: ↑↓←→ pindah fokus, Enter buka, Backspace/Alt+↑ ke folder induk. Di editor: Esc (fokus di luar teks) = kembali.
  - Ctrl+B/I dan sejenisnya tidak ditangkap global. Tiptap yang menanganinya.

---

## 3. Struktur folder

```
task-note/
├─ CLAUDE.md
├─ package.json
├─ electron.vite.config.ts        # main/preload/renderer; preload output CJS; alias @shared
├─ electron-builder.yml           # NSIS, asarUnpack *.node, extraResources drizzle/ → migrations/
├─ drizzle.config.ts              # dialect sqlite, schema src/main/db/schema.ts, casing snake_case
├─ tsconfig.json                  # references
├─ tsconfig.node.json             # main + preload + shared + scripts
├─ tsconfig.web.json              # renderer + shared
├─ eslint.config.mjs
├─ .prettierrc
├─ vitest.config.ts               # projects: shared (node), main-db (node), renderer (jsdom, opsional)
├─ build/
│  └─ icon.ico
├─ drizzle/                       # migrasi hasil drizzle-kit (jangan diedit setelah dibuat)
│  ├─ 0000_init.sql
│  ├─ 0001_fts_and_triggers.sql   # custom: FTS5, trigger sinkron, trigger batas kedalaman
│  └─ meta/
├─ scripts/
│  └─ migrate.mjs                 # terapkan migrasi ke DB dev (Node biasa)
├─ docs/
│  └─ PLAN.md
└─ src/
   ├─ shared/
   │  ├─ ipc/
   │  │  ├─ channels.ts           # INVOKE_CHANNELS & EVENT_CHANNELS (as const), tanpa dependensi
   │  │  ├─ contract.ts           # { [channel]: { input: ZodSchema } } + tipe output
   │  │  └─ result.ts             # Result<T>, ErrorCode
   │  ├─ types.ts                 # TaskDto, HistoryDayDto, NoteDto, FolderDto, dll.
   │  └─ logic/
   │     ├─ duration.ts (+ .test.ts)    # parseDuration, formatMinutes
   │     ├─ checklist.ts (+ .test.ts)   # applyToggle, recomputeParent
   │     ├─ progress.ts (+ .test.ts)    # effectiveEstimate, segments, summary
   │     ├─ dates.ts (+ .test.ts)       # toDateKey, parseDateKey, addDaysKey, isFutureKey, monthRange
   │     ├─ folders.ts (+ .test.ts)     # depth, buildTree, descendants
   │     ├─ noteText.ts (+ .test.ts)    # tiptapJsonToText
   │     └─ ftsQuery.ts (+ .test.ts)    # buildFtsMatch (escape + prefix)
   ├─ main/
   │  ├─ index.ts                 # bootstrap (§1.3)
   │  ├─ window.ts                # BrowserWindow, simpan/pulihkan bounds
   │  ├─ security.ts              # CSP, will-navigate, window open, permission
   │  ├─ clock.ts                 # Clock { now(): Date } (bisa di-mock)
   │  ├─ errors.ts                # AppError(code, message)
   │  ├─ db/
   │  │  ├─ schema.ts             # skema Drizzle (§4)
   │  │  ├─ client.ts             # openDb(path) → { sqlite, db }
   │  │  ├─ migrate.ts            # hasPendingMigrations, runMigrations (+ pre-backup)
   │  │  ├─ purge.ts
   │  │  └─ __tests__/            # migrasi, FTS, trigger
   │  ├─ services/
   │  │  ├─ todoService.ts  timeService.ts  historyService.ts
   │  │  ├─ notesService.ts foldersService.ts searchService.ts
   │  │  ├─ settingsService.ts backupService.ts
   │  │  └─ __tests__/            # *.test.ts dengan SQLite in-memory
   │  ├─ backup/
   │  │  ├─ exportFormat.ts       # skema Zod file ekspor (formatVersion 1)
   │  │  ├─ scheduler.ts          # backup otomatis harian + rotasi 14 file
   │  │  └─ fileOps.ts            # tulis atomik (tmp → rename)
   │  └─ ipc/
   │     ├─ register.ts           # handle(), cek sender, Result wrapper
   │     └─ todo.ts time.ts history.ts notes.ts folders.ts search.ts backup.ts settings.ts app.ts
   ├─ preload/
   │  ├─ index.ts
   │  └─ index.d.ts               # declare global { interface Window { api: Api } }
   └─ renderer/
      ├─ index.html               # meta CSP
      └─ src/
         ├─ main.tsx
         ├─ styles.css            # @import tailwindcss; @theme token warna/font; font lokal
         ├─ app/
         │  ├─ App.tsx            # QueryClientProvider, RouterProvider
         │  ├─ router.tsx
         │  ├─ AppShell.tsx       # sidebar + outlet + toast + shortcut
         │  ├─ Sidebar.tsx
         │  ├─ GlobalShortcuts.tsx
         │  └─ RestoreLastRoute.tsx
         ├─ features/
         │  ├─ todo/
         │  │  ├─ TodoLayout.tsx  TodoTabs.tsx
         │  │  ├─ manage/…        # §6.2
         │  │  └─ history/…       # §6.3
         │  ├─ notes/…            # §6.4–6.5
         │  └─ settings/…         # §6.6
         ├─ components/ui/        # Button, IconButton, Input, Dialog, ConfirmDialog, Menu, Toast, Tabs, EmptyState, Kbd
         ├─ lib/
         │  ├─ api.ts             # wrapper window.api → throw AppError
         │  ├─ queryClient.ts
         │  ├─ queryKeys.ts
         │  ├─ useToday.ts
         │  ├─ useReducedMotion.ts
         │  └─ format.ts          # formatLongDate, formatTime, formatMinutes (re-export)
         └─ stores/
            ├─ toastStore.ts      # toast + aksi "Undo"
            └─ uiStore.ts         # status simpan editor, query cari, dll.
```

---

## 4. Skema database (Drizzle)

Semua tabel memakai `integer primary key autoincrement`. `AUTOINCREMENT` sengaja dipilih
karena ID yang pernah dipakai tidak akan dipakai ulang, sehingga referensi snapshot di histori tetap
aman. Drizzle dikonfigurasi dengan `casing: 'snake_case'`. Kolom waktu instan berisi ISO 8601 UTC
(`2026-09-25T03:12:00.000Z`), sedangkan kolom tanggal harian berisi `YYYY-MM-DD` lokal.

Pragma saat koneksi dibuka: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=3000`.

### 4.1 Tabel

```ts
// src/main/db/schema.ts (rancangan)
export const tasks = sqliteTable('tasks', {
  id: integer().primaryKey({ autoIncrement: true }),
  parentId: integer().references((): AnySQLiteColumn => tasks.id, { onDelete: 'cascade' }),
  title: text().notNull(),
  estimateMinutes: integer(),                 // null = tanpa estimasi
  position: text().notNull(),                 // fractional index, unik per induk
  isChecked: integer({ mode: 'boolean' }).notNull().default(false),
  checkedAt: text(),                          // ISO instan; null jika tidak tercentang
  checkedDate: text(),                        // YYYY-MM-DD lokal saat dicentang
  onlyForDate: text(),                        // YYYY-MM-DD → item "Today only"; null = harian
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
  deletedAt: text(),                          // hanya untuk undo; di-purge saat start
}, (t) => [
  uniqueIndex('tasks_parent_position_uq').on(t.parentId, t.position),
  index('tasks_only_for_date_idx').on(t.onlyForDate),
  index('tasks_checked_date_idx').on(t.checkedDate),
  check('tasks_title_len', sql`length(trim(${t.title})) between 1 and 200`),
  check('tasks_estimate', sql`${t.estimateMinutes} is null or ${t.estimateMinutes} between 1 and 1440`),
  check('tasks_checked_consistent',
    sql`(${t.isChecked} = 1 and ${t.checkedAt} is not null and ${t.checkedDate} is not null)
        or (${t.isChecked} = 0 and ${t.checkedAt} is null and ${t.checkedDate} is null)`),
  check('tasks_only_for_root', sql`${t.onlyForDate} is null or ${t.parentId} is null`),
]);

export const taskHistory = sqliteTable('task_history', {
  id: integer().primaryKey({ autoIncrement: true }),
  date: text().notNull(),                     // YYYY-MM-DD lokal
  taskId: integer().notNull(),                // referensi snapshot, TANPA FK
  parentTaskId: integer(),                    // null = list utama; TANPA FK
  title: text().notNull(),                    // snapshot judul item
  parentTitle: text(),                        // snapshot judul induk (untuk sub list)
  parentSubtaskTotal: integer(),              // jumlah sub induk saat dicentang
  checkedAt: text().notNull(),
}, (t) => [
  uniqueIndex('task_history_date_task_uq').on(t.date, t.taskId),
  index('task_history_date_idx').on(t.date),
]);

export const timeEntries = sqliteTable('time_entries', {
  id: integer().primaryKey({ autoIncrement: true }),
  date: text().notNull(),
  minutes: integer().notNull(),
  note: text(),                               // keterangan opsional, maks 200
  taskId: integer().references(() => tasks.id, { onDelete: 'set null' }),
  taskTitle: text(),                          // snapshot judul list tertaut
  createdAt: text().notNull(),                // "jam dicatat"
  deletedAt: text(),                          // hanya untuk undo
}, (t) => [
  index('time_entries_date_idx').on(t.date),
  check('time_entries_minutes', sql`${t.minutes} between 1 and 1440`),
]);

export const folders = sqliteTable('folders', {
  id: integer().primaryKey({ autoIncrement: true }),
  parentId: integer().references((): AnySQLiteColumn => folders.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  position: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
}, (t) => [
  uniqueIndex('folders_parent_position_uq').on(t.parentId, t.position),
  check('folders_name_len', sql`length(trim(${t.name})) between 1 and 80`),
]);

export const notes = sqliteTable('notes', {
  id: integer().primaryKey({ autoIncrement: true }),
  folderId: integer().references(() => folders.id, { onDelete: 'set null' }),
  title: text().notNull().default(''),
  contentJson: text().notNull().default('{"type":"doc","content":[]}'),
  contentText: text().notNull().default(''),  // dihitung main dari contentJson
  isPinned: integer({ mode: 'boolean' }).notNull().default(false),
  pinnedAt: text(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
  deletedAt: text(),                          // != null → di Sampah
}, (t) => [
  index('notes_folder_idx').on(t.deletedAt, t.folderId, t.updatedAt),
  index('notes_deleted_at_idx').on(t.deletedAt),
]);

export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),                    // JSON; bentuknya divalidasi Zod per key
  updatedAt: text().notNull(),
});
```

| Tabel | Kegunaan |
|---|---|
| `tasks` | Struktur daily reusable list (list utama dan sub list, maksimal 1 tingkat) beserta status centang saat ini. Kolom `onlyForDate` menandai item sekali pakai. |
| `task_history` | Snapshot item yang dicentang per tanggal. Hanya ditulis saat centang dan dihapus saat uncheck di hari yang sama. Tidak terpengaruh reset, edit, maupun hapus list. |
| `time_entries` | Catatan waktu per tanggal (durasi dalam menit, keterangan, dan tautan opsional ke list utama beserta snapshot judulnya). |
| `folders` | Pohon folder catatan (maksimal 3 tingkat), diurutkan per induk. |
| `notes` | Catatan: JSON Tiptap, teks polos untuk pencarian, pin, dan soft delete (sampah). |
| `settings` | Key-value JSON: route terakhir, bounds jendela, konfigurasi backup, status banner. |

**Key `settings` (divalidasi Zod di `settingsService`):** `ui.lastRoute` (string), `ui.lastNotesFolder`
(string), `window.bounds` ({x,y,width,height,isMaximized}), `backup.enabled` (bool),
`backup.dir` (string \| null), `backup.lastRunAt` (ISO), `backup.lastResult`
({ok, file?, message?}), `todo.resetBannerDismissedDate` (YYYY-MM-DD).

### 4.2 Relasi dan aturan penghapusan

| Relasi | Aturan | Alasan |
|---|---|---|
| `tasks.parent_id → tasks.id` | CASCADE | Menghapus induk berarti sub ikut terhapus. Soft delete dilakukan service pada induk dan sub sekaligus. |
| `time_entries.task_id → tasks.id` | SET NULL | Catatan waktu tetap ada. `task_title` menjaga label. |
| `task_history.*task_id` | Tanpa FK | Snapshot harus utuh walaupun task di-purge. ID tidak dipakai ulang. |
| `folders.parent_id → folders.id` | CASCADE | Subfolder ikut terhapus. Nasib catatan diurus service terlebih dahulu (lihat §7.7). |
| `notes.folder_id → folders.id` | SET NULL | Pengaman: catatan (termasuk yang ada di sampah) jatuh ke "Unfiled". |

**Trigger batas kedalaman** (migrasi custom, sebagai jaring pengaman selain validasi di service):

```sql
-- sub list maksimal 1 tingkat
CREATE TRIGGER tasks_max_depth_ins BEFORE INSERT ON tasks
WHEN NEW.parent_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'TASK_DEPTH')
  WHERE (SELECT parent_id FROM tasks WHERE id = NEW.parent_id) IS NOT NULL;
END;
-- (sama untuk BEFORE UPDATE OF parent_id)

-- folder maksimal 3 tingkat (CTE tidak diizinkan di trigger → cek 2 induk ke atas)
CREATE TRIGGER folders_max_depth_ins BEFORE INSERT ON folders
WHEN NEW.parent_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'FOLDER_DEPTH')
  WHERE (SELECT gp.parent_id FROM folders p JOIN folders gp ON gp.id = p.parent_id
         WHERE p.id = NEW.parent_id) IS NOT NULL;
END;
```

Folder tidak bisa dipindah ke induk lain pada v1 (lihat §10), jadi trigger `UPDATE` untuk folder belum diperlukan.

### 4.3 Strategi kolom `position`: fractional indexing

**Pilihan:** string kunci pecahan dari pustaka `fractional-indexing` (`generateKeyBetween(a, b)`),
dibandingkan secara biner (`ORDER BY position`). Unik per induk.

**Alasan:**
- Memindahkan satu item hanya mengubah **satu baris** (`position` = kunci di antara dua tetangga).
  Transaksi kecil, cocok untuk optimistic update, dan tidak perlu menomori ulang seluruh saudara.
- Tidak perlu jeda angka (1000, 2000, …) yang suatu saat habis dan butuh renormalisasi massal.
- Deterministik dan mudah dites. Main menghitung kunci dari `beforeId`/`afterId`, sedangkan
  renderer cukup menyusun ulang array secara optimistic tanpa perlu tahu kuncinya.
- Item baru ditambahkan di akhir: `generateKeyBetween(lastKey, null)`.

**Konsekuensi:** kunci bisa memanjang jika item terus disisipkan di titik yang sama. Mitigasinya,
jika panjang kunci lebih dari 64 karakter, service memanggil `rebalance(parentId)` yang membuat ulang kunci merata
untuk saudara-saudaranya (`generateNKeysBetween`) dalam satu transaksi. Kasus ini diuji.

### 4.4 FTS5 dan sinkronisasi

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, content_text,
  content='notes', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.id, new.title, new.content_text);
END;
CREATE TRIGGER notes_fts_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
  VALUES ('delete', old.id, old.title, old.content_text);
END;
CREATE TRIGGER notes_fts_au AFTER UPDATE OF title, content_text ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
  VALUES ('delete', old.id, old.title, old.content_text);
  INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.id, new.title, new.content_text);
END;
```

- Drizzle tidak mendukung virtual table, sehingga FTS dan semua trigger dibuat di migrasi custom
  (`npm run db:custom -- --name=fts_and_triggers`). `drizzle-kit generate` hanya membandingkan snapshot skema,
  jadi tabel FTS tidak akan "didrop" pada generate berikutnya.
- `content_text` **selalu** dihitung di main (`tiptapJsonToText`), bukan dikirim dari renderer, sehingga
  indeks tidak bisa berbeda dari isi catatan. Blok dipisah dengan `\n`, sedangkan item checklist dan kode ikut terindeks.
- Catatan di sampah tetap ada di indeks, tetapi disaring lewat `JOIN notes … WHERE deleted_at IS NULL`.
- Setelah impor: `INSERT INTO notes_fts(notes_fts) VALUES('rebuild')`. Test memakai
  `INSERT INTO notes_fts(notes_fts) VALUES('integrity-check')`.
- Query pencarian: `buildFtsMatch("rapat mingguan")` menghasilkan `"rapat"* "mingguan"*` (setiap token dikutip
  sehingga operator FTS dari pengguna dinetralkan, lalu diberi prefix, dan semua token digabung dengan AND). Urutan hasil
  memakai `bm25(notes_fts, 5.0, 1.0)` (judul lebih berbobot), lalu `updated_at` terbaru. Sorotan
  memakai `highlight()`/`snippet()` dengan penanda karakter private-use ``/``, yang di renderer
  dipecah menjadi `<mark>` tanpa `dangerouslySetInnerHTML`.

---

## 5. Kanal IPC

Konvensi: semua kanal memakai `ipcMain.handle` dan mengembalikan `Result<T>`. Kode error:
`VALIDATION`, `NOT_FOUND`, `LIMIT` (kedalaman/ukuran), `CONFLICT`, `IO`, `FORBIDDEN` (pengirim bukan frame utama aplikasi), `INTERNAL`.
Pesan error berbahasa Inggris dan siap ditampilkan ke pengguna. Tipe `Id = z.number().int().positive()`,
`DateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isValidDateKey)`.

### 5.1 Todo

| Kanal | Deskripsi | Input (Zod) | Output |
|---|---|---|---|
| `todo:getBoard` | Semua list untuk hari ini: harian ditambah item `onlyForDate = hari ini`, tanpa yang dihapus, terurut | `z.void()` | `{ today: DateKey, tasks: TaskDto[] }` (list utama + `subtasks[]`) |
| `todo:create` | Tambah list/sub list di akhir | `{ title: z.string().trim().min(1).max(200), parentId: Id.optional(), estimateMinutes: z.number().int().min(1).max(1440).nullable().optional(), onlyToday: z.boolean().optional() }` (`onlyToday` hanya untuk list utama) | `TaskDto` (+ induk jika status centangnya berubah) |
| `todo:update` | Ubah judul/estimasi | `{ id: Id, title?: …, estimateMinutes?: …nullable() }` | `TaskDto` |
| `todo:delete` | Soft delete list (beserta sub) atau sub list. Invarian induk dihitung ulang | `{ id: Id }` | `{ deletedIds: Id[], parent?: TaskDto }` |
| `todo:restore` | Batalkan hapus | `{ id: Id }` | `TaskDto[]` (item + induk yang terpengaruh) |
| `todo:toggle` | Centang/batal centang, dengan propagasi induk↔sub dan penulisan/penghapusan histori | `{ id: Id, checked: z.boolean() }` | `{ changed: TaskDto[] }` |
| `todo:reorder` | Pindahkan item di antara saudara (induk sama) | `{ id: Id, beforeId: Id.nullable(), afterId: Id.nullable() }` | `{ id, position }` |
| `todo:reset` | Hapus semua centang, histori tidak disentuh | `z.void()` | `{ snapshot: { id, checkedAt, checkedDate }[] }` |
| `todo:undoReset` | Pulihkan centang dari snapshot | `{ snapshot: z.array(…).max(2000) }` | `{ changed: TaskDto[] }` |
| `todo:getDayStatus` | Untuk banner hari baru | `z.void()` | `{ today, hasStaleChecks: boolean, staleSince: DateKey \| null, dismissed: boolean }` |
| `todo:dismissResetBanner` | "Later" untuk hari ini | `z.void()` | `void` |

### 5.2 Waktu

| Kanal | Deskripsi | Input | Output |
|---|---|---|---|
| `time:listForDate` | Catatan waktu pada suatu tanggal | `{ date: DateKey }` | `TimeEntryDto[]` (`id, minutes, note, taskId, taskTitle, createdAt`) |
| `time:create` | Catat waktu **hari ini** (tanggal ditentukan main) | `{ hours: z.number().int().min(0).max(24), minutes: z.number().int().min(0).max(59), note: z.string().trim().max(200).optional(), taskId: Id.optional() }` + refine total 1–1440 dan `taskId` harus list utama | `TimeEntryDto` |
| `time:delete` | Soft delete (bisa di-undo) | `{ id: Id }` | `{ id }` |
| `time:restore` | Batalkan hapus | `{ id: Id }` | `TimeEntryDto` |

### 5.3 Histori

| Kanal | Deskripsi | Input | Output |
|---|---|---|---|
| `history:getDay` | Histori satu tanggal | `{ date: DateKey }` (tidak boleh masa depan) | `HistoryDayDto = { date, completedCount, totalMinutes, groups: HistoryGroup[], timeEntries: TimeEntryDto[] }`. `HistoryGroup = { key, title, status: 'full' \| 'partial', checkedAt?, subtasks: { title, checkedAt }[], subtaskTotal? }` |
| `history:getMarkedDates` | Tanggal yang memiliki data dalam satu bulan (penanda kalender) | `{ month: z.string().regex(/^\d{4}-\d{2}$/) }` | `DateKey[]` (union `task_history.date` dan `time_entries.date` yang tidak dihapus, dengan query rentang `date >= 'YYYY-MM-01' AND date < bulan+1`) |
| `history:getDailyTotals` | Total menit per hari dalam rentang tanggal (ringkasan 7 hari) | `{ from: DateKey, to: DateKey }` (refine `from ≤ to`, maksimal 62 hari) | `{ date, minutes, completedCount }[]`: setiap tanggal di rentang, hari tanpa data bernilai 0 |

### 5.4 Catatan

| Kanal | Deskripsi | Input | Output |
|---|---|---|---|
| `notes:list` | Daftar catatan untuk suatu tampilan | `{ scope: z.discriminatedUnion('kind', [ {kind:'all'}, {kind:'unfiled'}, {kind:'trash'}, {kind:'folder', folderId: Id} ]) }` | `NoteSummaryDto[]` (`id, title, preview(≤140), folderId, isPinned, createdAt, updatedAt, deletedAt`), diurutkan: pin (`pinnedAt` desc), lalu `updatedAt` desc |
| `notes:get` | Isi lengkap | `{ id: Id }` | `NoteDto` (+ `contentJson` yang sudah di-parse) |
| `notes:create` | Catatan baru kosong | `{ folderId: Id.nullable() }` | `NoteDto` |
| `notes:update` | Autosave judul/isi | `{ id: Id, title?: z.string().max(200), contentJson?: TiptapDocSchema }` (`TiptapDocSchema` = rekursif longgar `{type, content?, text?, marks?, attrs?}`, ukuran JSON maksimal 2 MB) | `{ id, updatedAt, title }` |
| `notes:moveToFolder` | Pindah folder (drag & drop / menu) | `{ id: Id, folderId: Id.nullable() }` | `NoteSummaryDto` |
| `notes:setPinned` | Pin/lepas pin | `{ id: Id, pinned: z.boolean() }` | `NoteSummaryDto` |
| `notes:trash` | Pindah ke sampah | `{ id: Id }` | `{ id, deletedAt }` |
| `notes:restore` | Pulihkan dari sampah (folder sudah hilang → tanpa folder) | `{ id: Id }` | `NoteSummaryDto` |
| `notes:deletePermanently` | Hapus permanen satu catatan di sampah | `{ id: Id }` | `{ id }` |
| `notes:emptyTrash` | Kosongkan sampah | `z.void()` | `{ deletedCount }` |

### 5.5 Folder

| Kanal | Deskripsi | Input | Output |
|---|---|---|---|
| `folders:list` | Semua folder (flat, renderer membangun tree) + jumlah catatan | `z.void()` | `{ folders: FolderDto[] (id, parentId, name, position, depth, noteCount), counts: { all, unfiled, trash } }` |
| `folders:create` | Folder/subfolder baru | `{ name: z.string().trim().min(1).max(80), parentId: Id.nullable() }` | `FolderDto` (error `LIMIT` jika kedalaman > 3, `CONFLICT` jika nama sama di induk yang sama) |
| `folders:rename` | Ganti nama | `{ id: Id, name: … }` | `FolderDto` |
| `folders:reorder` | Urutkan ulang di antara saudara | `{ id: Id, beforeId: Id.nullable(), afterId: Id.nullable() }` | `{ id, position }` |
| `folders:getDeleteImpact` | Data untuk dialog hapus | `{ id: Id }` | `{ subfolderCount, noteCount }` (rekursif) |
| `folders:delete` | Hapus folder + subfolder | `{ id: Id, notes: z.enum(['trash', 'unfile']) }` | `{ deletedFolderIds: Id[], affectedNoteCount }` |

### 5.6 Pencarian

| Kanal | Deskripsi | Input | Output |
|---|---|---|---|
| `search:notes` | FTS5 pada judul + isi, tanpa sampah | `{ query: z.string().trim().min(1).max(200), folderId: Id.nullable().optional(), includeSubfolders: z.boolean().default(true) }` | `{ id, folderId, titleHighlighted, snippetHighlighted, updatedAt }[]` (maksimal 100). Penanda `…` |

### 5.7 Backup

| Kanal | Deskripsi | Input | Output |
|---|---|---|---|
| `backup:exportToFile` | Main membuka dialog Simpan lalu menulis JSON seluruh data | `z.void()` | `{ canceled: true } \| { canceled: false, filePath, counts }` |
| `backup:pickImportFile` | Main membuka dialog Buka, membaca dan memvalidasi file, lalu menyimpan hasil parse dengan token (TTL 10 menit) | `z.void()` | `{ canceled: true } \| { canceled: false, token: string, exportedAt, appVersion, counts }` atau error `VALIDATION` beserta detail |
| `backup:confirmImport` | Menimpa seluruh data (didahului backup pengaman `.sqlite`), lalu event `app:dataReplaced` | `{ token: z.string().uuid() }` | `{ counts, safetyBackupPath }` |
| `backup:getStatus` | Status untuk halaman Pengaturan | `z.void()` | `{ enabled, dir, lastRunAt, lastResult, files: { name, size, mtime }[] }` |
| `backup:chooseFolder` | Dialog pilih folder backup | `z.void()` | `{ canceled } \| { dir }` |
| `backup:setEnabled` | Aktif/nonaktifkan backup otomatis | `{ enabled: z.boolean() }` | `BackupStatus` |
| `backup:runNow` | Jalankan backup sekarang | `z.void()` | `{ file }` |
| `backup:openFolder` | `shell.openPath(dir)` | `z.void()` | `void` |

### 5.8 Pengaturan dan aplikasi

| Kanal | Deskripsi | Input | Output |
|---|---|---|---|
| `settings:get` | Baca key yang di-whitelist | `{ key: z.enum([...UI_KEYS]) }` | nilai sesuai skema key atau `null` |
| `settings:set` | Tulis key yang boleh ditulis renderer (`ui.*` saja) | `{ key: z.enum(['ui.lastRoute','ui.lastNotesFolder']), value: z.string().max(300) }` | `void` |
| `app:getInfo` | Versi, path DB, path userData | `z.void()` | `{ version, dbPath, userDataPath }` |

`window.bounds`, `backup.*`, dan `todo.*` hanya ditulis oleh main atau lewat kanal khususnya.

---

## 6. Struktur komponen renderer

Wireframe low-fi (SVG) ada di `docs/wireframes/`: `01-manage-list`, `02-list-history`, `03a-notes-grid`,
`03b-note-editor`, `04-settings`, dan `05-dialogs-and-states`. Teks UI di wireframe berbahasa Inggris; anotasinya berbahasa Indonesia.

### 6.1 Kerangka
```
App (QueryClientProvider, RouterProvider)
└─ AppShell
   ├─ Sidebar  [To-Do List, Catatan · · · Pengaturan]
   ├─ GlobalShortcuts
   ├─ ToastHost (toast + tombol "Undo", aria-live="polite")
   └─ <Outlet/>
```

### 6.2 `/todo/manage`
```
TodoLayout
├─ TodoTabs  ["Manage List" | "List History"]  (role=tablist, NavLink)
└─ ManageListPage
   ├─ NewDayBanner            (todo:getDayStatus → "Some items are still checked from yesterday. Reset the checklist now?" [Reset] [Later])
   ├─ ManageListHeader
   │  ├─ TodayDate            ("Friday, September 25, 2026")
   │  ├─ SegmentedProgressBar (progress.ts#buildSegments)
   │  ├─ SummaryStats         (selesai x/y · sisa estimasi · waktu tercatat vs estimasi)
   │  └─ ResetButton          (konfirmasi ringan → toast "Undo")
   ├─ main column
   │  ├─ AddTaskForm          (judul + estimasi bebas + toggle "Today only"; Ctrl+N fokus ke sini)
   │  └─ TaskList             (DndContext + SortableContext list utama)
   │     └─ TaskItem          (checkbox, judul inline-edit, EstimateBadge, menu ⋯, handle drag)
   │        ├─ SubtaskList    (SortableContext sendiri per induk)
   │        │  └─ SubtaskItem
   │        └─ AddSubtaskForm
   └─ right column: TimeTodayPanel
      ├─ TimeEntryForm        (jam, menit, keterangan, pilih list opsional)
      ├─ TimeTotals           ("Logged 3h 20m of 5h estimated")
      └─ TimeEntryList → TimeEntryItem (hapus → toast Batalkan)
```

### 6.3 `/todo/history(/:date)`
```
ListHistoryPage   (tanggal dari param; useHistoryKeyboard ←/→)
├─ left column
│  ├─ HistoryDatePicker       (react-day-picker: locale enUS, weekStartsOn 1,
│  │                            disabled {after: today}, endMonth = bulan ini, modifier hasData → titik)
│  ├─ DayNavButtons           ["‹ Previous day" | "Today" | "Next day ›" (nonaktif saat hari ini)]
│  └─ WeekSummaryChart        (7 batang, div/SVG tanpa pustaka chart; klik → navigate)
└─ right column: HistoryDayDetail
   ├─ HistoryDayTitle         ("Thursday, September 24, 2026" + badge "Yesterday"/"Today")
   ├─ HistoryDaySummary       (item selesai · total waktu)
   ├─ HistoryGroupList → HistoryGroup (full: ikon centang merah; partial: "Partial · 2 of 3", garis putus)
   ├─ HistoryTimeEntries      (durasi, keterangan/list, jam dicatat)
   └─ EmptyState              ("No activity recorded for this date.")
```

### 6.4 Catatan: tampilan petak (`/notes`, `/notes/folder/:folderId`, `/notes/all`, `/notes/trash`)
Model seperti file explorer: halaman menampilkan isi **satu lokasi** sebagai petak (grid responsif).
Akar `/notes` berisi petak folder tingkat 1 dan catatan tanpa folder.
```
NotesPage
├─ NotesHeader
│  ├─ NoteSearchBox           (Ctrl+F; cakupan "This folder" (+ subfolder) / "All notes"; debounce 200 ms)
│  ├─ NewFolderButton         (disembunyikan di folder tingkat 3 dan di mode Semua/Sampah)
│  └─ NewNoteButton           (Ctrl+N; membuat catatan di lokasi aktif lalu membuka editor)
├─ ViewSwitch                 [Browse folders · All notes · Trash (jumlah)]
├─ Breadcrumb                 (Notes › Kuliah › Semester 5; setiap segmen = link + target drop)
├─ FolderGrid                 (SortableContext; hanya di mode Jelajah)
│  ├─ FolderTile              (ikon, nama, jumlah isi; klik/Enter = buka; ⋯: ganti nama, hapus; droppable untuk catatan)
│  └─ NewFolderTile           (petak "+ New folder")
├─ NoteGrid
│  └─ NoteTile                (judul, cuplikan ±3 baris, 📌, "Edited …"; draggable; ⋯: Pin, Move to…, Delete)
├─ SearchResults → SearchResultItem (HighlightedText; menggantikan grid saat ada query)
├─ TrashToolbar               (mode Trash: "Empty trash"; info 30 hari)
├─ EmptyState                 ("This folder is empty." + tombol buat catatan/folder)
├─ MoveToDialog               (pohon folder untuk "Move to…")
└─ DeleteFolderDialog         ("Move them to Unfiled" vs "Move them to Trash")
```
- Grid memakai `grid-template-columns: repeat(auto-fill, minmax(…))`: petak folder ±190 px, petak catatan ±240 px.
- Navigasi keyboard: roving tabindex antar-petak (↑↓←→), Enter = buka, Backspace/Alt+↑ = ke folder induk,
  Shift+F10/tombol menu = menu ⋯. Drag & drop juga bisa lewat keyboard (dnd-kit KeyboardSensor).
- Drag petak catatan ke petak folder atau ke segmen breadcrumb memindahkan catatan. Drag petak folder di antara
  petak folder mengubah urutan (`folders:reorder`). Folder tidak bisa di-drop ke folder lain (v1).

### 6.5 Catatan: editor (`/notes/edit/:noteId`)
```
NoteEditorPage
├─ EditorTopBar
│  ├─ BackButton              ("← Back" ke lokasi asal; Esc saat fokus tidak di editor)
│  ├─ Breadcrumb              (lokasi folder catatan + judul)
│  └─ NoteActions             [📌 Pin] [Move to…] [⋯ → Delete (to Trash)]
├─ NoteTitleInput
├─ NoteMeta                   ("Created …" · "Edited …" · status "Saving…/Saved")
├─ EditorToolbar              (sticky; H1–H3, B, I, bullet, bernomor, checklist, kode, kutipan)
├─ NoteEditor                 (Tiptap: StarterKit + TaskList/TaskItem + Placeholder; kolom baca maks. ±760 px)
└─ TrashNoteBanner            (catatan di sampah: read-only; [Restore] [Delete forever])
```
Autosave: debounce 700 ms setelah perubahan terakhir. Flush dilakukan saat kembali/pindah halaman, unmount, dan `beforeunload`.
Mutasi dijalankan berurutan per catatan (antrean) agar tidak saling mendahului.

### 6.6 `/settings`
`SettingsPage` → `BackupSettings` (toggle, folder, jalankan sekarang, daftar 14 file, status terakhir),
`ExportImportSection` (ekspor, impor → `ImportConfirmDialog` yang menampilkan jumlah data file vs data saat ini),
`AppInfo`.

### 6.7 Query key (`lib/queryKeys.ts`)

| Key | Sumber | Diinvalidasi oleh |
|---|---|---|
| `['todo','board']` | `todo:getBoard` | create/update/delete/restore/reset/undoReset/reorder (toggle & reorder: optimistic) |
| `['todo','dayStatus']` | `todo:getDayStatus` | toggle, reset, dismiss, pergantian hari |
| `['time','date',date]` | `time:listForDate` | time:create/delete/restore |
| `['history','day',date]` | `history:getDay` | toggle/undoReset (hari ini), time:* (hari ini) |
| `['history','marked',month]` | `history:getMarkedDates` | toggle, time:* (bulan ini) |
| `['history','totals',from,to]` | `history:getDailyTotals` | time:*, toggle |
| `['folders']` | `folders:list` | folders:*, notes:create/move/trash/restore/delete/emptyTrash |
| `['notes','list',scopeKey]` | `notes:list` | notes:* (update: hanya perbarui title/updatedAt di cache) |
| `['notes','detail',id]` | `notes:get` | tidak di-refetch saat mengetik (editor menjadi sumber). Diinvalidasi saat restore/move |
| `['notes','search',query,folderId]` | `search:notes` | notes:update/trash/restore (stale) |
| `['backup','status']` | `backup:getStatus` | backup:*, event `backup:statusChanged` |
| `['settings',key]` | `settings:get` | settings:set |

Pergantian hari (`useToday` berubah) → invalidasi `['todo']`, `['time']`, `['history']`.
Event `app:dataReplaced` → `queryClient.resetQueries()`.

---

## 7. Aturan bisnis (dapat diuji)

### 7.1 Parsing estimasi (`parseDuration`)
- D1. Input di-trim dan diproses tanpa membedakan huruf besar/kecil. String kosong menghasilkan `null` (tanpa estimasi).
- D2. Bentuk yang diterima (menghasilkan menit):
  - `45` → 45 (angka polos = menit)
  - `45m`, `45 m`, `45 min`, `45 mins`, `45 minutes` → 45
  - `1h`, `1 h`, `1 hr`, `1 hour` → 60
  - `1h 30m`, `1h30m`, `1 hour 30 minutes` → 90
  - `1:30` → 90, `0:45` → 45
  - `1.5h`, `1.5 hours` → 90
  - `2 hours` → 120
  - Unit Indonesia tetap diterima sebagai alias (`1j`, `2 jam`, `30 menit`, `mnt`) agar kebiasaan lama tetap jalan.
- D3. Ditolak (mengembalikan pesan error berbahasa Inggris): `abc`, `1:75` (menit ≥ 60), `0`, `0m`, nilai negatif, lebih dari 1440 menit, unit ganda seperti `1h 2h`.
- D4. `formatMinutes(90)` → `"1h 30m"`, `formatMinutes(60)` → `"1h"`, `formatMinutes(45)` → `"45m"`, `formatMinutes(0)` → `"0m"`.
- D5. Parse lalu format lalu parse kembali menghasilkan nilai yang sama (round-trip).

### 7.2 Centang induk dan sub (`applyToggle`)
- C1. Mencentang list utama tanpa sub hanya mengubah list itu.
- C2. Mencentang list utama yang punya sub akan mencentang semua sub yang belum tercentang. `checkedAt` sub yang sudah tercentang tidak berubah.
- C3. Membatalkan centang list utama akan membatalkan semua sub-nya.
- C4. Jika sub terakhir yang belum tercentang dicentang, induk otomatis tercentang.
- C5. Jika satu sub dibatalkan, induk otomatis ikut dibatalkan, sedangkan sub lain tetap.
- C6. Menambah sub baru (belum tercentang) ke induk yang tercentang membuat induk tidak tercentang.
- C7. Menghapus satu-satunya sub yang belum tercentang (sementara sub lain tercentang) membuat induk otomatis tercentang. Menghapus semua sub tidak mengubah status induk.
- C8. Toggle ke status yang sama tidak menghasilkan perubahan (idempoten).
- C9. Toggle pada item yang di-soft-delete atau tidak ada menghasilkan error `NOT_FOUND`.

### 7.3 Histori snapshot
- H1. Setiap item yang berubah menjadi tercentang (termasuk hasil propagasi) mendapat entri
  `task_history` dengan `date = hari ini`, `title`, dan untuk sub juga `parentTaskId`, `parentTitle`, `parentSubtaskTotal`, serta `checkedAt`.
- H2. Dicentang ulang di hari yang sama menimpa entri yang sama (unik `date+taskId`), bukan menambah baris baru.
- H3. Membatalkan centang menghapus entri item itu **hanya untuk tanggal hari ini**. Entri di tanggal lain tidak berubah
  (item yang tercentang sejak kemarin lalu dibatalkan hari ini tetap tercatat di kemarin).
- H4. Reset dan undo reset tidak menambah maupun menghapus entri histori.
- H5. Mengubah judul, menghapus, atau mem-purge task tidak mengubah entri histori yang sudah ada.
- H6. Pengelompokan di `history:getDay`: kunci grup = `parentTaskId ?? taskId`. Status `full` jika ada entri
  untuk list utama itu sendiri pada tanggal tersebut. Status `partial` jika hanya ada entri sub. Judul grup diambil dari
  entri induk jika ada, jika tidak dari `parentTitle` sub.
- H7. `completedCount` = jumlah entri (list utama dan sub) pada tanggal itu. `totalMinutes` = jumlah `time_entries.minutes` yang tidak dihapus.
- H8. Centang dari hari sebelumnya yang masih tersisa (belum di-reset) **tidak** dihitung sebagai histori hari ini.

### 7.4 Reset dan pergantian hari
- R1. `todo:reset` mengosongkan `isChecked/checkedAt/checkedDate` semua task. Judul, estimasi, urutan, dan histori tidak berubah.
- R2. `todo:reset` mengembalikan snapshot. `todo:undoReset(snapshot)` memulihkan persis status sebelumnya
  (item yang dihapus di antaranya diabaikan). Toast "Undo" tampil selama 10 detik.
- R3. `hasStaleChecks = true` jika ada task aktif dengan `checkedDate < hari ini`.
- R4. Banner tampil jika `hasStaleChecks` bernilai true dan `todo.resetBannerDismissedDate ≠ hari ini`. Reset tidak pernah berjalan otomatis.
- R5. "Later" menyembunyikan banner sampai tanggal berikutnya.
- R6. Item "Today only" (`onlyForDate = D`) hanya tampil pada tanggal D, dan di-purge saat start jika `D < hari ini`
  (histori tetap ada). Pilihan ini hanya tersedia untuk list utama. Sub list mengikuti induknya.
- R7. Pergantian hari saat aplikasi terbuka terdeteksi paling lambat 60 detik kemudian, atau segera saat fokus/resume.
  Setelah itu query diinvalidasi dan banner dievaluasi ulang.

### 7.5 Progres dan ringkasan (`progress.ts`)
- P1. `effectiveEstimate(list)` = estimasi list itu sendiri jika ada. Jika tidak, jumlah estimasi sub (null dihitung 0).
- P2. Bobot segmen = `effectiveEstimate`. Jika bernilai 0, bobot = rata-rata bobot yang bukan nol. Jika semuanya 0, semua bobot sama.
  Lebar segmen = bobot / total bobot.
- P3. Isi segmen: 1 jika list tercentang. Jika tidak dan list punya sub, isi = (estimasi sub tercentang / estimasi seluruh sub)
  jika semua sub punya estimasi, jika tidak memakai perbandingan jumlah sub. Selain itu 0.
- P4. "Items done" dihitung per item daun: list tanpa sub dihitung 1, setiap sub dihitung 1.
- P5. Sisa estimasi = Σ per list utama: `effectiveEstimate × (1 − isi segmen)`, dibulatkan ke menit.
- P6. Perbandingan waktu = total `time_entries` hari ini vs Σ `effectiveEstimate` semua list utama yang tampil.

### 7.6 Catatan waktu
- W1. Durasi = `jam×60 + menit`, harus 1–1440. Tanggal selalu hari ini (ditentukan di main).
- W2. `taskId` opsional dan harus menunjuk list utama aktif. `taskTitle` disimpan sebagai snapshot.
- W3. Hapus bersifat soft delete, dapat dibatalkan lewat toast, dan di-purge saat start berikutnya.

### 7.7 Folder dan catatan
- F1. Kedalaman folder maksimal 3 (root = 1). Membuat subfolder di folder tingkat 3 menghasilkan `LIMIT` dengan pesan
  "Folders can only be nested 3 levels deep." Tombol dan petak "+ Folder" disembunyikan saat berada di folder tingkat 3.
- F2. Nama folder di-trim, panjangnya 1–80 karakter, dan unik (tanpa membedakan huruf besar/kecil) di antara saudara dengan induk yang sama.
- F3. Hapus folder `notes:'unfile'` memindahkan semua catatan di folder dan seluruh turunannya (termasuk yang di sampah) ke
  tanpa folder, lalu menghapus folder dan subfolder.
- F4. Hapus folder `notes:'trash'` memindahkan catatan aktif di pohon itu ke sampah (`deletedAt = now`, `folderId = null`),
  lalu menghapus folder. Catatan yang sudah di sampah juga menjadi tanpa folder.
- F5. Mode Jelajah menampilkan satu lokasi: petak subfolder langsung (urut `position`) lalu petak catatan yang **langsung**
  berada di lokasi itu. Akar `/notes` = folder tingkat 1 + catatan `folderId IS NULL` ("Unfiled").
"All notes" = semua catatan yang tidak di sampah, tanpa petak folder. Jumlah pada petak folder = catatan langsung + subfolder.
- F6. Pencarian dengan cakupan folder mencakup subfolder secara default (CTE rekursif).
- F7. Urutan daftar: yang disematkan dulu (`pinnedAt` desc), lalu `updatedAt` desc. Menyematkan tidak mengubah `updatedAt`.
- F8. `updatedAt` hanya berubah jika judul atau isi benar-benar berbeda dari sebelumnya (autosave yang tidak mengubah apa-apa tidak menggeser urutan).
- F9. Judul kosong ditampilkan sebagai "Untitled". Pencarian tetap memakai isi.
- F10. Drop catatan pada petak folder atau segmen breadcrumb = `notes:moveToFolder` ke folder itu (segmen "Notes" = tanpa folder).
  Drop pada lokasi asalnya tidak melakukan apa-apa. Petak folder hanya bisa diurutkan ulang, tidak bisa di-drop ke folder lain.

### 7.8 Sampah
- S1. `notes:trash` mengisi `deletedAt`. Catatan hilang dari semua tampilan kecuali Sampah dan tidak muncul di hasil pencarian.
- S2. `notes:restore` mengosongkan `deletedAt`. Jika folder asal sudah tidak ada, catatan kembali ke Tanpa folder.
- S3. Purge otomatis saat start dan setiap 24 jam: hapus permanen catatan dengan `deletedAt < now − 30 hari`.
- S4. Kosongkan sampah dan hapus permanen memerlukan konfirmasi. Entri FTS ikut terhapus lewat trigger.
- S5. Catatan di sampah hanya bisa dibaca (editor `editable=false`).

### 7.9 Pemilihan tanggal histori
- T1. Default hari ini. Tanggal masa depan dinonaktifkan di kalender, tombol "Next day" nonaktif saat hari ini,
  dan URL dengan tanggal masa depan dialihkan ke hari ini.
- T2. "Previous day"/"Next day" menggeser ±1 hari kalender (aman terhadap DST, memakai `addDays` pada tanggal lokal).
- T3. Label "Today" jika `date = today`, "Yesterday" jika `date = today − 1`, tanpa label jika lainnya.
- T4. Judul memakai format `EEEE, MMMM d, yyyy` dengan locale `enUS` ("Thursday, September 24, 2026"). Jam memakai format 12-jam `h:mm a` ("4:45 PM").
- T5. Titik penanda muncul pada tanggal yang punya entri histori **atau** catatan waktu aktif di bulan yang sedang ditampilkan.
- T6. Ringkasan 7 hari = `today−6 … today`. Mengklik batang menavigasi ke `/todo/history/<date>`.
- T7. ←/→ tidak aktif saat fokus berada di input, contenteditable, atau grid kalender.

### 7.10 Backup
- B1. File ekspor: `{ app:'tasknote', formatVersion:1, schemaVersion, appVersion, exportedAt, data:{ tasks, taskHistory, timeEntries, folders, notes, settings(tanpa window.* dan backup.dir) } }`.
- B2. Impor ditolak jika `app`/`formatVersion` tidak cocok, validasi Zod gagal, terdapat referensi induk atau folder yang yatim, atau kedalaman
  melebihi batas. Data saat ini tidak berubah jika ditolak.
- B3. Impor yang dikonfirmasi: backup `.sqlite` pengaman dibuat, lalu satu transaksi (hapus semua, insert dengan ID asli), lalu FTS `rebuild`,
  lalu `app:dataReplaced`. Jika transaksi gagal, data lama tetap utuh.
- B4. Backup otomatis berjalan jika aktif, folder tersedia, dan `lastRunAt` bukan hari ini. Nama file:
  `tasknote-YYYY-MM-DD-HHmmss.json`, ditulis ke `.tmp` lalu di-rename.
- B5. Rotasi: hanya file yang cocok dengan pola nama di atas yang dihitung. Simpan 14 terbaru, dan file lain di folder tidak pernah disentuh.
- B6. Folder tidak tersedia (misalnya drive tercabut) → `lastResult.ok=false` dengan pesan, aplikasi tidak crash, dan dicoba lagi di jadwal berikutnya.
- B7. Sebelum migrasi tertunda dijalankan, `db.backup()` ke `userData/backups/pre-migrate-*.sqlite` (simpan 5).

---

## 8. Tahapan pengerjaan

Satu tahap per sesi. Setiap tahap baru dianggap selesai jika **`npm run typecheck`, `npm run lint`, `npm test` lulus**
dan semua kriteria selesainya sudah dicek.

- [x] **Tahap 1: Setup proyek dan keamanan dasar** — selesai 25 September 2026
  - Tujuan: scaffold electron-vite React-TS, konfigurasi TS strict, ESLint + Prettier, Tailwind v4 + token tema,
    font lokal, runner Vitest, dan baseline keamanan.
  - File: `package.json`, `.npmrc`, `electron.vite.config.ts`, `tsconfig*.json`, `eslint.config.mjs`, `.prettierrc`,
    `vitest.config.ts`, `src/main/{index,window,security,csp,appUrl}.ts` (+test `csp`, `appUrl`), `src/preload/index.ts`,
    `src/preload/index.d.ts`, `src/shared/ipc/api.ts`, `src/renderer/index.html`,
    `src/renderer/src/{main.tsx,styles.css,app/App.tsx}`, `src/shared/logic/dates.ts(+test)`.
  - Selesai jika: `npm run dev` membuka jendela gelap dengan teks berfont Plus Jakarta Sans (tanpa request jaringan).
    Di DevTools, `typeof require === 'undefined'` dan `window.api` ada. Navigasi ke `https://…` diblokir. Header/meta CSP ada.
    Dev memakai userData `TaskNote (Dev)`. `npm test` menjalankan test `dates` yang lulus.
  - Hasil verifikasi: typecheck, lint, dan 19 test lulus. Dev dan build produksi (`electron-vite preview`) dicek lewat
    Chrome DevTools Protocol: `require`/`process`/`module` tidak ada, `window.api` ada, font termuat dari file lokal,
    tidak ada request non-lokal, navigasi ke `https://example.com` diblokir, dan `window.open('file:///…')` ditolak.
    Di produksi CSP memblokir inline script dan string-eval. ESLint menolak import `fs`/`electron` dari renderer.
  - **Penyimpangan dari rencana:**
    - better-sqlite3 13 memakai **N-API** dengan binary bawaan per platform (`prebuilds/win32-x64.node`), jadi tidak
      perlu rebuild untuk ABI Electron. Akibatnya `scripts/run-vitest.mjs`, runner Electron-as-Node, dan `postinstall:
      electron-builder install-app-deps` **dihapus dari rencana**. Vitest berjalan dengan Node biasa (`vitest run`).
    - Versi: Vite **7.3** (electron-vite 5 belum mendukung Vite 8) dan TypeScript **6.0** (typescript-eslint 8
      mendukung `<6.1`). Semua versi di-pin persis lewat `.npmrc` (`save-exact=true`).
    - Electron 44 mengunduh binary saat pertama dijalankan (tanpa `postinstall`). npm 11 memblokir install script yang
      belum disetujui. Script `esbuild` disetujui lewat `allowScripts` di `package.json`.
    - Tambahan file: `src/main/csp.ts` (CSP disisipkan ke `index.html` oleh plugin Vite; dev dilonggarkan untuk HMR),
      `src/main/appUrl.ts` (cek URL aplikasi, dipakai ulang untuk verifikasi pengirim IPC di Tahap 2), dan
      `src/shared/ipc/api.ts` (tipe `window.api`).
    - `build.assetsInlineLimit: 0` untuk renderer, karena subset font kecil sempat di-inline sebagai `data:` dan
      diblokir CSP `font-src 'self'`.
    - Renderer-only library (React, font) diletakkan di `devDependencies` karena selalu dibundel. `dependencies`
      hanya untuk modul yang dipakai main saat runtime (saat ini `date-fns`).

- [x] **Tahap 2: Database, migrasi, dan fondasi IPC** — selesai 26 September 2026
  - Tujuan: better-sqlite3 + Drizzle, skema lengkap §4, migrasi custom FTS dan trigger, migrasi otomatis dengan backup
    sebelum migrasi, `handle()` + `Result`, preload dari daftar kanal, `settings:*`, `app:getInfo`, dan helper DB test.
  - File: `drizzle.config.ts`, `drizzle/*`, `src/main/db/*`, `src/main/ipc/{register,settings,app}.ts`,
    `src/main/services/settingsService.ts`, `src/shared/ipc/*`, `src/preload/*`, `src/renderer/src/lib/api.ts`,
    `scripts/migrate.mjs`, `src/main/db/__tests__/*`.
  - Selesai jika: DB dibuat di userData saat start pertama. Test migrasi di `:memory:` lulus (semua tabel, index, trigger,
    FTS ada). Input tidak valid ke `settings:set` menghasilkan `{ok:false, code:'VALIDATION'}`. Pemanggilan dari
    frame asing ditolak. Membuat migrasi dummy memunculkan file `pre-migrate-*.sqlite`.
  - Hasil verifikasi: typecheck, lint, dan 51 test lulus (32 test baru). Test DB memakai migrasi asli dari `drizzle/`:
    - Semua tabel, index, 6 trigger, dan tabel FTS5 terbentuk. Migrasi idempoten dan `foreign_keys` aktif.
    - Constraint teruji: kedalaman sub list dan folder, CHECK, CASCADE/SET NULL, dan histori tanpa FK.
    - FTS tetap sinkron saat insert/update/delete, lolos `integrity-check`, dan bisa mencari tanpa diakritik.
    - Migrasi dummy pada DB file memunculkan `pre-migrate-*.sqlite` berisi data sebelum migrasi.
    - Migrasi rusak di-rollback dan backup-nya tetap ada. Rotasi hanya menyisakan 5 backup.
    - Uji `dispatch`: input tidak valid menghasilkan `VALIDATION`. Pengirim dari situs remote, file lain,
      subframe, atau frame yang sudah hancur menghasilkan `FORBIDDEN`. Error tak terduga menjadi `INTERNAL`
      tanpa membocorkan detail.
    - Runtime dev: `tasknote.db` terbentuk di `%APPDATA%\TaskNote (Dev)`. Lewat DevTools, `settings:set` dengan nilai
      angka, key `backup.dir`, atau properti tambahan ditolak `VALIDATION`, sedangkan set/get yang valid tersimpan.
    - Build produksi (`electron-vite preview`): DB terbaca dan validasi aktif. Preload hasil build hanya berisi
      `electron` + daftar kanal (CJS), dan Zod tidak ikut ke bundle renderer. `npm run db:migrate` melaporkan
      "up to date".
  - **Penyimpangan dari rencana:**
    - Kode error baru `FORBIDDEN` untuk pengirim yang bukan frame utama aplikasi (sebelumnya tidak ada di §5).
    - Logika IPC dipisah: `src/main/ipc/dispatch.ts` (murni, teruji tanpa Electron) dan `register.ts` (pembungkus
      `ipcMain.handle`). Tambahan `src/main/clock.ts` (`systemClock`, `fixedClock`), `src/main/errors.ts` (`AppError`),
      dan `src/shared/ipc/schemas.ts` (`idSchema`, `dateKeySchema`).
    - `window.api.*` mengembalikan `Result` apa adanya. `renderer/src/lib/api.ts` membukanya dan melempar `ApiError`.
      Kanal dengan output `void` mengembalikan `{ ok: true }` tanpa `data`.
    - Kanal event main → renderer (`app:systemResumed`, dll.) dan purge saat start (§1.3 langkah 4) belum dibuat.
      Keduanya dikerjakan di tahap yang membutuhkannya (Tahap 4, 7, 11, 13).
    - Test DB ada di `src/main/db/__tests__/` (`schema.test.ts`, `migrate.test.ts`, helper `testDb.ts`). Test service
      dan dispatch diletakkan di samping filenya.
    - Temuan: penanda breakpoint Drizzle yang ditulis di dalam komentar SQL tetap dipakai sebagai pemisah dan merusak
      migrasi. Aturan ini dicatat di CLAUDE.md.
    - npm `allowScripts`: `better-sqlite3` ditolak (skrip `node-gyp rebuild` tidak diperlukan karena memakai prebuild
      N-API), `esbuild@0.18.20` (dari drizzle-kit) disetujui.
    - `npm audit`: 4 temuan moderate pada esbuild lama di dalam drizzle-kit (devDependency, hanya untuk membuat file
      migrasi dan tidak ikut ke aplikasi). Perbaikan otomatis dari npm justru men-downgrade drizzle-kit, jadi tidak
      diterapkan. Periksa lagi saat drizzle-kit rilis versi baru.
    - Catatan skema: unique index `(parent_id, position)` tidak menjaga keunikan untuk baris dengan `parent_id NULL`
      (list utama dan folder akar), karena SQLite menganggap NULL selalu berbeda. Service wajib menjaganya lewat
      fractional indexing (Tahap 4 dan 10).

- [ ] **Tahap 3: Layout, navigasi, dan infrastruktur UI**
  - Tujuan: AppShell, Sidebar (+ Pengaturan di bawah), TodoTabs, router lengkap (halaman berisi placeholder), pemulihan route
    terakhir, simpan/pulihkan bounds jendela, shortcut Ctrl+1/2/3, toast dengan "Undo", komponen UI dasar, `useToday`.
  - File: `src/renderer/src/app/*`, `components/ui/*`, `stores/toastStore.ts`, `lib/{queryClient,queryKeys,useToday,useReducedMotion}.ts`,
    `src/main/window.ts`.
  - Selesai jika: semua route pada §2 bisa dibuka. Route `/todo/history/2999-01-01` dialihkan ke hari ini. Setelah restart, aplikasi
    kembali ke route terakhir dengan ukuran/posisi jendela yang sama (termasuk maximized, dan bounds di luar layar direset).
    Semua elemen interaktif punya ring fokus `#D9545C`. Transisi mati saat `prefers-reduced-motion`.

- [ ] **Tahap 4: Kelola List (CRUD list dan sub list, estimasi)**
  - Tujuan: `todoService` create/update/delete/restore/getBoard, parser durasi, item "Today only", UI daftar, dan undo hapus.
  - File: `src/shared/logic/duration.ts(+test)`, `src/main/services/todoService.ts(+test)`, `src/main/ipc/todo.ts`,
    `features/todo/manage/{ManageListPage,AddTaskForm,TaskList,TaskItem,SubtaskList,SubtaskItem,AddSubtaskForm,EstimateInput}.tsx`, `hooks/useTodoBoard.ts`.
  - Selesai jika: semua aturan D1–D5 teruji. Menambah sub di bawah sub ditolak (service dan trigger). Hapus → toast
    "Undo" memulihkan item beserta sub. Item "Today only" tidak tampil ketika clock test digeser +1 hari. Ctrl+N memfokuskan form.

- [ ] **Tahap 5: Centang, histori snapshot, dan header progres**
  - Tujuan: `applyToggle` + penulisan `task_history`, optimistic update, `SegmentedProgressBar`, `SummaryStats`.
  - File: `src/shared/logic/{checklist,progress}.ts(+test)`, `todoService.toggle(+test)`, `ManageListHeader.tsx`,
    `SegmentedProgressBar.tsx`, `SummaryStats.tsx`, `hooks/useToggleTask.ts`.
  - Selesai jika: C1–C9, H1–H5, dan P1–P5 teruji. Centang langsung terlihat tanpa menunggu IPC, dan saat IPC gagal (disimulasikan)
    status di-rollback dan toast error muncul. Segmen sebagian terisi saat sub tercentang sebagian.

- [ ] **Tahap 6: Drag & drop pengurutan**
  - Tujuan: `todo:reorder` dengan fractional indexing + rebalance, dnd-kit (mouse dan keyboard), Alt+↑/↓, serta pengumuman aksesibilitas berbahasa Inggris.
  - File: `src/main/services/todoService.ts` (reorder + test), `TaskList.tsx`, `SubtaskList.tsx`, `lib/dndAnnouncements.ts`.
  - Selesai jika: urutan tersimpan setelah restart. Sub tidak bisa dipindah ke induk lain. Keyboard (Spasi ambil, panah, Spasi lepas,
    Esc batal) dan Alt+↑/↓ berfungsi. Test rebalance lulus (100 sisipan di posisi yang sama). Animasi mati saat reduced-motion.

- [ ] **Tahap 7: Waktu hari ini, reset, dan banner hari baru**
  - Tujuan: `timeService`, `TimeTodayPanel`, reset + undo, `todo:getDayStatus`, `NewDayBanner`, dan deteksi pergantian hari.
  - File: `src/main/services/timeService.ts(+test)`, `src/main/ipc/time.ts`, `features/todo/manage/{TimeTodayPanel,TimeEntryForm,TimeEntryList,NewDayBanner,ResetButton}.tsx`,
    event `app:systemResumed`.
  - Selesai jika: W1–W3 dan R1–R7 teruji (clock di-mock melewati tengah malam). Setelah reset, histori hari ini tetap. Banner muncul
    saat clock digeser ke hari berikutnya dengan centang tersisa, dan hilang setelah "Later" sampai hari berikutnya.

- [ ] **Tahap 8: Histori List (pilih tanggal dan detail)**
  - Tujuan: `historyService.getDay/getMarkedDates`, halaman List History dengan kalender berbahasa Inggris (en-US), navigasi tombol dan route, serta detail tanggal dan empty state.
  - File: `src/main/services/historyService.ts(+test)`, `src/main/ipc/history.ts`,
    `features/todo/history/{ListHistoryPage,HistoryDatePicker,DayNavButtons,HistoryDayDetail,HistoryGroup,HistoryTimeEntries}.tsx`.
  - Selesai jika: H6–H8 dan T1–T5 teruji. Kalender dimulai hari Senin (Mon) dengan nama hari/bulan bahasa Inggris dan titik pada tanggal yang punya data.
    Setelah list diedit/dihapus, histori lama tetap menampilkan judul lama.
    Query `getDay` dan `getMarkedDates` memakai index (`EXPLAIN QUERY PLAN` di test).

- [ ] **Tahap 9: Histori (ringkasan 7 hari dan keyboard)**
  - Tujuan: `history:getDailyTotals`, `WeekSummaryChart`, shortcut ←/→, dan penyempurnaan aksesibilitas.
  - File: `historyService.getDailyTotals(+test)`, `WeekSummaryChart.tsx`, `hooks/useHistoryKeyboard.ts`.
  - Selesai jika: T6–T7 teruji. Grafik menampilkan 7 hari dengan hari kosong bernilai 0, setiap batang punya `aria-label`
    ("Thu, Sep 24: 3h 20m"), dan klik batang mengganti tanggal.

- [ ] **Tahap 10: Catatan (folder dan CRUD catatan dengan editor)**
  - Tujuan: `foldersService` (create/rename/reorder/list), `notesService` (list/get/create/update), `tiptapJsonToText`,
    tampilan petak (FolderGrid, NoteGrid, Breadcrumb, ViewSwitch, navigasi keyboard), halaman editor Tiptap dengan toolbar + shortcut + markdown input rules, dan autosave.
  - File: `src/shared/logic/{folders,noteText}.ts(+test)`, `src/main/services/{foldersService,notesService}.ts(+test)`,
    `src/main/ipc/{folders,notes}.ts`, `features/notes/*` (NotesPage, NotesHeader, ViewSwitch, Breadcrumb, FolderGrid, FolderTile, NoteGrid, NoteTile, EmptyState, NoteEditorPage, NoteEditor, EditorToolbar, NoteMeta).
  - Selesai jika: F1, F2, F5, F7–F9 teruji. Folder tingkat 4 ditolak. Navigasi petak dengan keyboard (↑↓←→, Enter, Backspace) berfungsi. `# ` menjadi heading, dan Ctrl+B/I, `- `, `1. `, `[ ] `, ```` ``` ````, `> ` berfungsi.
    Isi tersimpan tanpa tombol, dan status "Saved" tampil. Waktu dibuat/diubah benar. Pindah catatan saat debounce belum selesai tidak kehilangan ketikan.

- [ ] **Tahap 11: Catatan (pindah, pin, hapus folder, sampah)**
  - Tujuan: `notes:moveToFolder` (drag & drop ke petak folder atau breadcrumb + menu "Move to…"), pin, `DeleteFolderDialog`, sampah + purge 30 hari.
  - File: `notesService`/`foldersService` (+test), `src/main/db/purge.ts(+test)`, `NoteTile.tsx`, `FolderTile.tsx`, `Breadcrumb.tsx`, `MoveToDialog.tsx`, `DeleteFolderDialog.tsx`, `TrashToolbar.tsx`, `TrashNoteBanner.tsx`.
  - Selesai jika: F3, F4, F10, dan S1–S5 teruji. Petak catatan bisa di-drag ke petak folder dan ke segmen breadcrumb (termasuk akar), dengan mouse maupun keyboard. Petak folder bisa diurutkan ulang. Catatan yang disematkan selalu di atas.
    Purge menghapus catatan berumur 31 hari tetapi tidak yang berumur 29 hari (clock di-mock).

- [ ] **Tahap 12: Pencarian catatan**
  - Tujuan: `searchService` FTS5, `buildFtsMatch`, sorotan, cakupan folder, dan Ctrl+F.
  - File: `src/shared/logic/ftsQuery.ts(+test)`, `src/main/services/searchService.ts(+test)`, `src/main/ipc/search.ts`,
    `features/notes/{NoteSearchBox,SearchResults,HighlightedText}.tsx`.
  - Selesai jika: pencarian judul dan isi (termasuk awalan kata dan kata tanpa diakritik) menemukan catatan yang benar. Catatan di sampah tidak muncul.
    Input seperti `"` , `AND`, `*`, `NEAR(` tidak menyebabkan error. Kata yang cocok disorot dengan `<mark>`. Cakupan "This folder" menyertakan subfolder.
    `integrity-check` FTS lulus setelah rangkaian create/update/trash/delete.

- [ ] **Tahap 13: Ekspor dan impor JSON**
  - Tujuan: format ekspor §7.10, ekspor via dialog, impor dengan validasi, pratinjau jumlah data, konfirmasi, backup pengaman, dan `app:dataReplaced`.
  - File: `src/main/backup/{exportFormat,fileOps}.ts`, `src/main/services/backupService.ts(+test)`, `src/main/ipc/backup.ts`,
    `features/settings/{SettingsPage,ExportImportSection,ImportConfirmDialog}.tsx`.
  - Selesai jika: B1–B3 teruji. Round-trip ekspor → DB kosong → impor menghasilkan data identik (termasuk pencarian FTS). File rusak
    atau yatim ditolak dan data saat ini tetap utuh.

- [ ] **Tahap 14: Backup otomatis dan halaman Pengaturan**
  - Tujuan: scheduler harian, pilih folder, rotasi 14 file, status, jalankan sekarang, dan buka folder.
  - File: `src/main/backup/scheduler.ts(+test)`, `backupService` (+test), `features/settings/BackupSettings.tsx`.
  - Selesai jika: B4–B6 teruji (folder temp, clock di-mock). File selain pola nama backup tidak pernah dihapus. Folder yang dihapus saat
    aplikasi berjalan menghasilkan status error tanpa crash. Backup berjalan maksimal sekali per hari.

- [ ] **Tahap 15: Packaging dan QA akhir**
  - Tujuan: electron-builder NSIS (ikon, nama produk "TaskNote", pilihan folder instalasi, shortcut Start Menu dan Desktop),
    migrasi ikut dibundel, native module di-unpack, CSP produksi, serta DevTools dan menu dinonaktifkan di produksi.
  - File: `electron-builder.yml`, `build/icon.ico`, `src/main/index.ts` (path migrasi produksi), `package.json` (script `package`).
  - Selesai jika: `npm run package` menghasilkan `dist/TaskNote Setup x.y.z.exe`. Setelah instalasi di akun Windows bersih,
    aplikasi terbuka, DB dibuat di `%APPDATA%\TaskNote`, semua fitur utama lolos checklist smoke test manual (tertulis di
    tahap ini), dan uninstall tidak menghapus data pengguna.

---

## 9. Strategi testing

**Runner.** better-sqlite3 13 memakai N-API (binary yang sama untuk Node dan Electron), jadi Vitest berjalan dengan
Node biasa lewat `npm test` (`vitest run`). Tidak perlu runner Electron-as-Node atau rebuild ABI.
(Diputuskan di Tahap 1, lihat penyimpangan di §8.)

**Proyek Vitest**
| Proyek | Lingkungan | Cakupan |
|---|---|---|
| `shared` | node | Semua `src/shared/logic/*.test.ts`: logika murni dan cepat |
| `main` | node | Service + DB dengan SQLite `:memory:` |
| `renderer` (opsional, tahap berikutnya) | jsdom | Hook/komponen kritis. Memerlukan `@testing-library/react` (perlu persetujuan) |

**Unit test (shared)**
- `duration`: tabel kasus D1–D5 (valid, invalid, batas 1 dan 1440, round-trip).
- `checklist`: C1–C8 dengan fixture induk 0/1/3 sub dan kombinasi status.
- `progress`: P1–P5 (tanpa estimasi, estimasi campuran, sebagian).
- `dates`: `toDateKey` di sekitar tengah malam lokal, pergantian bulan dan tahun, tahun kabisat, `addDaysKey` saat DST
  (dites dengan `TZ=Europe/Berlin` dan `TZ=Asia/Jakarta` lewat env di runner), `isFutureKey`, `monthRange`.
- `folders`: depth, buildTree, descendants, validasi nama unik.
- `noteText`: heading, list bersarang, checklist, blok kode, dokumen kosong, dan node yang tidak dikenal (diabaikan tanpa error).
- `ftsQuery`: escape tanda kutip, operator, input hanya spasi/simbol → null.

**Test database (main, SQLite in-memory)**
- Helper `createTestDb()` membuat DB `:memory:`, mengaktifkan pragma, lalu menjalankan **semua migrasi dari folder `drizzle/`**
  (sehingga setiap test juga memvalidasi migrasi). Helper `fixedClock('2026-09-24T22:30:00+07:00')` dipakai untuk mengontrol waktu.
- Migrasi: semua tabel, index, trigger, dan virtual table ada. Migrasi idempoten jika dijalankan dua kali. Deteksi migrasi tertunda
  dan pembuatan backup pra-migrasi. Mulai v2, fixture DB versi lama dimigrasikan dan datanya harus utuh.
- Constraint dan trigger: kedalaman sub list, kedalaman folder, CHECK konsistensi centang, dan cascade/set null.
- Todo/histori: toggle menulis/menghapus histori sesuai H1–H5. Uncheck setelah tengah malam tidak menyentuh histori kemarin.
  Reset dan undo. Pengelompokan `getDay`. `getMarkedDates` di batas bulan. `getDailyTotals` mengisi hari kosong.
  `EXPLAIN QUERY PLAN` memastikan query per tanggal memakai `task_history_date_idx`/`time_entries_date_idx`.
- Catatan/FTS: sinkronisasi insert/update/delete, trash disaring, highlight, cakupan folder rekursif, `integrity-check`,
  dan `rebuild` setelah impor.
- Backup: round-trip ekspor–impor, penolakan file rusak dengan data tetap utuh, rotasi 14 file di folder temp, dan penulisan atomik.

**Manual/QA** (checklist di Tahap 15): shortcut, fokus keyboard, reduced-motion, restart untuk memulihkan state, dan instalasi bersih.

---

## 10. Risiko dan pertanyaan terbuka

### Risiko
| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Native module better-sqlite3** | Aplikasi gagal memuat DB | **Sudah teratasi di Tahap 1:** better-sqlite3 13 memakai N-API dengan binary bawaan (`prebuilds/win32-x64.node`), jadi satu binary berlaku untuk Node (test) dan Electron (aplikasi) tanpa rebuild. Tetap diperlukan: `asarUnpack: ["**/*.node"]` saat packaging, better-sqlite3 dibiarkan eksternal di bundle main (`build.externalizeDeps` bawaan electron-vite), dan versi di-pin persis. Jika suatu saat kembali ke versi non-N-API, rebuild butuh Visual Studio Build Tools (C++) + Python 3. |
| Migrasi tidak ditemukan di build produksi | Aplikasi gagal start | `extraResources: drizzle → migrations`. Path dipilih dengan `app.isPackaged ? process.resourcesPath/migrations : ./drizzle`. Diuji di Tahap 15 |
| Drizzle tidak mendukung FTS5/trigger | Skema tidak lengkap | Migrasi SQL custom + test keberadaan. Jangan pakai `drizzle-kit push` |
| Preload sandbox tidak bisa `require` paket npm | Preload gagal | Preload hanya mengimpor `electron` + file kanal tanpa dependensi, dibundel CJS |
| Pergantian hari, zona waktu, atau jam sistem berubah | Histori masuk ke tanggal yang salah | Satu sumber `toDateKey` di main, `useToday` + `powerMonitor`, test dengan clock dan TZ di-mock |
| Folder backup tersinkron (Google Drive) membaca file setengah jadi | Backup korup di cloud | Tulis ke `.tmp` lalu `rename`. Rotasi hanya untuk pola nama milik aplikasi |
| Dua instance aplikasi menulis ke DB yang sama | Konflik data | `requestSingleInstanceLock` |
| Kehilangan ketikan saat autosave | Data catatan hilang | Flush saat pindah, blur, dan `beforeunload`, dengan antrean mutasi per catatan |
| Installer tidak ditandatangani | Muncul peringatan SmartScreen | Diterima untuk penggunaan pribadi ("More info → Run anyway") |
| Undo hapus hilang saat aplikasi ditutup sebelum toast habis | Item terhapus permanen tanpa undo | Diterima. Purge soft delete hanya dilakukan saat start berikutnya |

### Pertanyaan terbuka (default yang dipakai jika tidak diubah)
1. **Isi petak folder:** hanya subfolder dan catatan yang langsung ada di folder itu (default, seperti file explorer). Perlu opsi menampilkan semua isi subfolder sekaligus?
2. **Memindah folder** ke induk lain (drag & drop folder antar-induk) tidak diminta, sehingga v1 hanya mendukung urut ulang di antara saudara. Perlu ditambahkan?
3. **Format backup otomatis:** JSON (default, sama dengan ekspor sehingga bisa langsung diimpor) atau salinan `.sqlite`?
4. **Durasi toast "Undo":** 10 detik (default)?
5. **Tautan di catatan:** ekstensi Link Tiptap tidak ada di daftar fitur editor, sehingga v1 tidak menyertakannya. Jika ditambahkan, klik tautan dibuka di browser default.
6. **Batas ukuran catatan:** 2 MB JSON per catatan (default), cukup?
7. **Ikon aplikasi:** perlu dibuat atau disediakan sebelum Tahap 15.
8. ~~**Nama produk**~~ — diputuskan: **TaskNote** (judul jendela, installer, folder `userData` `TaskNote`, DB `tasknote.db`, file backup `tasknote-*.json`).
