-- Migrasi custom: FTS5 untuk pencarian catatan, trigger sinkronisasi indeks,
-- dan trigger batas kedalaman (jaring pengaman selain validasi di service).
-- Setiap statement dipisah penanda breakpoint Drizzle karena migrator menjalankannya satu per satu.
-- Jangan menulis penanda itu di dalam komentar: migrator akan memotong file di sana.

-- Indeks FTS5 external-content: isi teks tetap disimpan di tabel `notes`.
CREATE VIRTUAL TABLE `notes_fts` USING fts5(
  title,
  content_text,
  content='notes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER `notes_fts_ai` AFTER INSERT ON `notes` BEGIN
  INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.id, new.title, new.content_text);
END;
--> statement-breakpoint
CREATE TRIGGER `notes_fts_ad` AFTER DELETE ON `notes` BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
  VALUES ('delete', old.id, old.title, old.content_text);
END;
--> statement-breakpoint
CREATE TRIGGER `notes_fts_au` AFTER UPDATE OF title, content_text ON `notes` BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_text)
  VALUES ('delete', old.id, old.title, old.content_text);
  INSERT INTO notes_fts(rowid, title, content_text) VALUES (new.id, new.title, new.content_text);
END;
--> statement-breakpoint
-- Sub list maksimal 1 tingkat: induk dari sebuah task tidak boleh punya induk.
CREATE TRIGGER `tasks_max_depth_ins` BEFORE INSERT ON `tasks`
WHEN NEW.parent_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'TASK_DEPTH')
  WHERE (SELECT parent_id FROM tasks WHERE id = NEW.parent_id) IS NOT NULL;
END;
--> statement-breakpoint
-- Saat memindah induk: induk baru tidak boleh sub list, dan task yang sudah punya
-- sub list tidak boleh dijadikan sub list (akan menjadi 2 tingkat).
CREATE TRIGGER `tasks_max_depth_upd` BEFORE UPDATE OF parent_id ON `tasks`
WHEN NEW.parent_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'TASK_DEPTH')
  WHERE (SELECT parent_id FROM tasks WHERE id = NEW.parent_id) IS NOT NULL
     OR EXISTS (SELECT 1 FROM tasks WHERE parent_id = NEW.id);
END;
--> statement-breakpoint
-- Folder maksimal 3 tingkat. CTE tidak diizinkan di trigger, jadi cek dua induk ke atas.
CREATE TRIGGER `folders_max_depth_ins` BEFORE INSERT ON `folders`
WHEN NEW.parent_id IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'FOLDER_DEPTH')
  WHERE (
    SELECT gp.parent_id FROM folders p JOIN folders gp ON gp.id = p.parent_id
    WHERE p.id = NEW.parent_id
  ) IS NOT NULL;
END;
