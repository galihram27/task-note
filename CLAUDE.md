# TaskNote — konteks proyek

Aplikasi desktop pribadi (1 pengguna, sepenuhnya offline, tanpa server/login) untuk
**to-do list harian yang dipakai ulang** + histori per tanggal, dan **catatan** rich text
dengan folder. Rencana lengkap, skema, kanal IPC, dan tahapan ada di `docs/PLAN.md`
(sumber kebenaran). Baca bagian yang relevan sebelum mengerjakan sebuah tahap.

## Halaman & route (HashRouter)
| Route | Isi |
|---|---|
| `/todo/manage` | 1a Manage List: CRUD list/sub list, centang, estimasi, waktu hari ini, reset |
| `/todo/history`, `/todo/history/:date` | 1b List History (hanya baca). `:date` = `YYYY-MM-DD`, tidak boleh di masa depan |
| `/notes`, `/notes/folder/:folderId`, `/notes/all`, `/notes/trash` | Notes: tampilan petak (folder + catatan di lokasi itu) |
| `/notes/edit/:noteId` | Editor satu catatan (dibuka dari petak catatan) |
| `/settings` | Backup, ekspor/impor, info aplikasi |

Sidebar: "To-Do List", "Notes", dan "Settings" kecil di bawah. Route terakhir disimpan
(`settings` key `ui.lastRoute`) dan dipulihkan saat start.

## Stack (sudah diputuskan — jangan diganti)
Electron + electron-vite + TypeScript (strict). Renderer: React, React Router, Tailwind CSS v4,
dnd-kit, Tiptap, TanStack Query, Zustand, date-fns (locale `enUS`), react-day-picker.
Data: SQLite via better-sqlite3 + Drizzle ORM + drizzle-kit, FTS5. Validasi: Zod (main).
Packaging: electron-builder (NSIS `.exe`, Windows). Test: Vitest. Package manager: **npm**.
Tambahan kecil yang disetujui: `fractional-indexing`, `@fontsource-variable/plus-jakarta-sans`.
Dependensi lain harus disebutkan dan disetujui dulu.

## Struktur folder (ringkas)
```
src/shared/     # kode murni tanpa Node/DOM: kontrak IPC (Zod), tipe DTO, logika bisnis
  ipc/channels.ts  ipc/contract.ts  ipc/result.ts  types.ts
  logic/  duration.ts checklist.ts progress.ts dates.ts folders.ts noteText.ts ftsQuery.ts
src/main/       # index.ts, window.ts, security.ts, csp.ts, appUrl.ts, db/, ipc/, services/, backup/
src/preload/    # index.ts (contextBridge) + index.d.ts (tipe window.api)
src/renderer/   # index.html + src/{app,features/{todo,notes,settings},components,lib,stores}
drizzle/        # migrasi SQL hasil drizzle-kit (+ migrasi custom untuk FTS/trigger)
scripts/        # migrate.mjs (Node biasa)
```

## Aturan keamanan Electron (wajib)
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: false`.
- Renderer tidak pernah menyentuh Node/DB. Semua akses lewat `window.api` dari preload
  (`contextBridge`). Preload hanya mengimpor `electron` dan `src/shared/ipc/channels.ts`
  (tanpa dependensi npm), output CJS.
- Setiap handler IPC dibungkus `handle()` di `src/main/ipc/register.ts`: cek
  `senderFrame.url` milik aplikasi, `schema.parse(input)` dengan Zod, kembalikan
  `Result` (`{ok:true,data}` / `{ok:false,error:{code,message}}`). Jangan lempar Error mentah.
- CSP ketat (tanpa `unsafe-eval`, tanpa sumber remote); `will-navigate` diblokir;
  `setWindowOpenHandler` → `shell.openExternal` hanya untuk `http(s)`, lalu `deny`.
  Semua permission request ditolak. Dialog file hanya dibuka dari main.
- Dev memakai folder `userData` terpisah (`TaskNote (Dev)`) agar data asli aman.

## Aturan data
- DB: `<userData>/tasknote.db`, pragma `foreign_keys=ON`, `journal_mode=WAL`.
- **Tanggal harian** = string `YYYY-MM-DD` zona waktu lokal, selalu dari
  `shared/logic/dates.ts#toDateKey()`. Instan waktu (`createdAt`, `checkedAt`) = ISO UTC.
  "Hari ini" (today) dihitung di main; renderer memakai hook `useToday()` (cek tiap menit,
  saat fokus jendela, dan saat resume) lalu invalidasi query.
- **Histori = snapshot** di `task_history` (judul, judul induk, ID induk, jumlah sub, waktu
  centang). Uncheck hanya menghapus entri **tanggal hari ini**. Reset, edit, dan hapus
  list tidak menyentuh histori. Kolom ID di histori sengaja tanpa FK.
- Invarian centang: induk ber-sub tercentang ⇔ semua sub tercentang. Logika murni di
  `shared/logic/checklist.ts`, dipakai main (otoritatif) dan renderer (optimistic).
- Urutan: kolom `position` TEXT memakai fractional indexing (lihat PLAN §4.3).
- Catatan: `content_json` (JSON Tiptap) + `content_text` (teks polos, dihitung di **main**
  dari JSON). FTS5 `notes_fts` external-content, sinkron via trigger SQL — jangan pernah
  menulis `notes_fts` manual kecuali `rebuild` setelah impor.
- Soft delete: `notes.deleted_at` (sampah 30 hari); `tasks`/`time_entries.deleted_at`
  hanya untuk undo, di-purge saat start.
- Optimistic update (TanStack Query `onMutate` + rollback) untuk centang dan pengurutan.
- Migrasi otomatis saat start; salinan `.sqlite` dibuat sebelum ada migrasi tertunda.

## Aturan bahasa (wajib)
- **Kode dalam bahasa Inggris:** nama folder, file, variabel, konstanta, objek, properti, class,
  type/interface, fungsi, hook, komponen, kanal IPC, tabel/kolom DB, dan nilai enum
  (mis. `status: 'full' | 'partial'`, bukan `'penuh'`).
- **Komentar kode dalam Bahasa Indonesia** (termasuk JSDoc dan catatan TODO).
  Contoh: `// Hitung ulang status induk setelah sub list berubah`.
- **Aplikasi (semua teks UI) dalam bahasa Inggris:** label, tombol, placeholder, toast, pesan
  error untuk pengguna, `aria-label`, dan pengumuman aksesibilitas. Tanggal memakai locale
  `enUS` dari date-fns: "Thursday, September 24, 2026" dan jam 12-jam "4:45 PM". Minggu tetap
  dimulai Senin (`weekStartsOn: 1`).
- Route berbahasa Inggris. Nama produk: **TaskNote**.
- **Pesan commit git selalu dalam bahasa Inggris** (judul singkat dalam bentuk imperatif,
  mis. `Add date key helpers`; isi opsional juga bahasa Inggris).
- Dokumen proyek (`CLAUDE.md`, `docs/`) tetap berbahasa Indonesia.

## Konvensi penamaan
- File modul `camelCase.ts`, komponen `PascalCase.tsx`, hook `useXxx.ts`, test `*.test.ts`
  di samping file yang diuji.
- Tabel SQL `snake_case` jamak; kolom TS `camelCase` (Drizzle `casing: 'snake_case'`).
- Kanal IPC `domain:action` (mis. `todo:toggle`, `notes:moveToFolder`). Skema Zod
  `<action>Input`, tipe output di `shared/types.ts`.
- Query key TanStack dari factory `renderer/src/lib/queryKeys.ts` saja.

## Menambah kanal IPC baru
1. Tambah nama di `src/shared/ipc/channels.ts` (daftar `as const`).
2. Tambah skema input Zod + tipe output di `src/shared/ipc/contract.ts`.
3. Implementasi logika di `src/main/services/<domain>Service.ts` (menerima `db` & `clock`
   sebagai parameter agar bisa dites dengan SQLite in-memory).
4. Daftarkan di `src/main/ipc/<domain>.ts` via `handle(channel, service.fn)`.
5. Preload otomatis mengekspos dari daftar kanal; pastikan tipe `window.api` ikut.
6. Tambah fungsi di `renderer/src/lib/api.ts` + query key + hook `useXxx`.
7. Tambah test service dan update tabel kanal di `docs/PLAN.md` §5.

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run dev` | electron-vite dev (HMR) |
| `npm run typecheck` | tsc untuk main/preload/shared dan renderer |
| `npm run lint` | ESLint (+ Prettier check) |
| `npm test` | Vitest (Node biasa) |
| `npm run db:generate` | drizzle-kit generate dari `src/main/db/schema.ts` |
| `npm run db:custom -- --name=<nama>` | migrasi SQL custom kosong (FTS, trigger) |
| `npm run db:migrate` | terapkan migrasi ke DB dev (biasanya otomatis saat start) |
| `npm run build` | typecheck + electron-vite build |
| `npm run package` | build + electron-builder `--win` (installer NSIS di `dist/`) |

better-sqlite3 13 memakai N-API: binary yang sama dipakai Node (test) dan Electron, tanpa rebuild.
Versi dependensi di-pin persis (`.npmrc` `save-exact=true`); npm 11 butuh `allowScripts` untuk install script.

## UI
Tema gelap default: latar `#080808`, panel `#121212`, garis `#2A2A2A`, aksen `#9B111E`
(isi/segmen/tombol, teks putih di atasnya), teks aksen `#D9545C` (label kecil, ring fokus).
Jangan pakai `#9B111E` sebagai warna teks di latar gelap (kontras kurang). Font Plus Jakarta
Sans dibundel lokal. Fokus keyboard selalu terlihat (`focus-visible`); animasi hanya di
`motion-safe:`. Shortcut global didaftarkan di renderer (bukan `globalShortcut`).

## Aturan kerja
- Kerjakan **satu tahap per sesi** sesuai `docs/PLAN.md` §8; jangan mengerjakan tahap lain.
- Sebelum menyatakan tahap selesai: `npm run typecheck`, `npm run lint`, `npm test` harus
  lulus, dan setiap kriteria selesai tahap sudah dicek. Laporkan hasilnya apa adanya.
- Setelah selesai, centang tahap di PLAN §8 dan catat penyimpangan dari rencana.
- Perubahan skema selalu lewat migrasi baru; jangan edit migrasi yang sudah ada.
- Logika bisnis baru ditaruh di `src/shared/logic` atau service main, lengkap dengan test.
