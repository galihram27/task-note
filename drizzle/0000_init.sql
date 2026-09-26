CREATE TABLE `folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`name` text NOT NULL,
	`position` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "folders_name_len" CHECK(length(trim("folders"."name")) between 1 and 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `folders_parent_position_uq` ON `folders` (`parent_id`,`position`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folder_id` integer,
	`title` text DEFAULT '' NOT NULL,
	`content_json` text DEFAULT '{"type":"doc","content":[]}' NOT NULL,
	`content_text` text DEFAULT '' NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`pinned_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notes_folder_idx` ON `notes` (`deleted_at`,`folder_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `notes_deleted_at_idx` ON `notes` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`task_id` integer NOT NULL,
	`parent_task_id` integer,
	`title` text NOT NULL,
	`parent_title` text,
	`parent_subtask_total` integer,
	`checked_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_history_date_task_uq` ON `task_history` (`date`,`task_id`);--> statement-breakpoint
CREATE INDEX `task_history_date_idx` ON `task_history` (`date`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`title` text NOT NULL,
	`estimate_minutes` integer,
	`position` text NOT NULL,
	`is_checked` integer DEFAULT false NOT NULL,
	`checked_at` text,
	`checked_date` text,
	`only_for_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`parent_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tasks_title_len" CHECK(length(trim("tasks"."title")) between 1 and 200),
	CONSTRAINT "tasks_estimate" CHECK("tasks"."estimate_minutes" is null or "tasks"."estimate_minutes" between 1 and 1440),
	CONSTRAINT "tasks_checked_consistent" CHECK(("tasks"."is_checked" = 1 and "tasks"."checked_at" is not null and "tasks"."checked_date" is not null) or ("tasks"."is_checked" = 0 and "tasks"."checked_at" is null and "tasks"."checked_date" is null)),
	CONSTRAINT "tasks_only_for_root" CHECK("tasks"."only_for_date" is null or "tasks"."parent_id" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_parent_position_uq` ON `tasks` (`parent_id`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_only_for_date_idx` ON `tasks` (`only_for_date`);--> statement-breakpoint
CREATE INDEX `tasks_checked_date_idx` ON `tasks` (`checked_date`);--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`minutes` integer NOT NULL,
	`note` text,
	`task_id` integer,
	`task_title` text,
	`created_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "time_entries_minutes" CHECK("time_entries"."minutes" between 1 and 1440),
	CONSTRAINT "time_entries_note_len" CHECK("time_entries"."note" is null or length("time_entries"."note") <= 200)
);
--> statement-breakpoint
CREATE INDEX `time_entries_date_idx` ON `time_entries` (`date`);