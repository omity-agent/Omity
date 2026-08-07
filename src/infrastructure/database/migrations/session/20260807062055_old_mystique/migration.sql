PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`control` text NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`profiles_json` text NOT NULL,
	`transcript_revision` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`workspace` text NOT NULL,
	CONSTRAINT "sessions_control" CHECK("control" in ('running', 'step', 'pause', 'cancel', 'pause_cancel'))
);
--> statement-breakpoint
INSERT INTO `__new_sessions`(`control`, `created_at`, `id`, `profiles_json`, `transcript_revision`, `updated_at`, `workspace`) SELECT `control`, `created_at`, `id`, `profiles_json`, `transcript_revision`, `updated_at`, `workspace` FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;