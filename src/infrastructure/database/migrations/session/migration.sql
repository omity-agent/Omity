CREATE TABLE `events` (
	`file_links_json` text NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`kind` text NOT NULL,
	`message_id` text NOT NULL,
	`part_id` text NOT NULL,
	`payload_json` text,
	`queue_id` integer NOT NULL,
	`session_id` text NOT NULL,
	CONSTRAINT `fk_events_queue_id_queue_id_fk` FOREIGN KEY (`queue_id`) REFERENCES `queue`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_events_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "events_kind" CHECK("kind" in ('assistant_reasoning_delta', 'assistant_text_delta', 'tool_call_delta', 'tool_finished', 'tool_started', 'user_appended')),
	CONSTRAINT "events_payload" CHECK(("kind" = 'user_appended' and "payload_json" is null) or ("kind" <> 'user_appended' and "payload_json" is not null))
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`created_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`message_json` text NOT NULL,
	`position` integer,
	`queue_id` integer,
	`session_id` text NOT NULL,
	`source_id` text NOT NULL,
	CONSTRAINT `fk_messages_queue_id_queue_id_fk` FOREIGN KEY (`queue_id`) REFERENCES `queue`(`id`),
	CONSTRAINT `fk_messages_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `reasoning_translations` (
	`message_id` text NOT NULL,
	`session_id` text NOT NULL,
	`source` text NOT NULL,
	`target_language` text NOT NULL,
	`translated` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_reasoning_translations_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `file_link_units` (
	`end` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`matches_json` text NOT NULL,
	`next_offset` integer NOT NULL,
	`owner_id` text NOT NULL,
	`queue_id` integer,
	`session_id` text NOT NULL,
	`start` integer NOT NULL,
	`surface` text NOT NULL,
	`text` text NOT NULL,
	`unit_index` integer NOT NULL,
	CONSTRAINT `fk_file_link_units_queue_id_queue_id_fk` FOREIGN KEY (`queue_id`) REFERENCES `queue`(`id`),
	CONSTRAINT `fk_file_link_units_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `checkpoint_writes` (
	`channel` text NOT NULL,
	`checkpoint_id` text NOT NULL,
	`checkpoint_ns` text NOT NULL,
	`write_index` integer NOT NULL,
	`task_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`type` text NOT NULL,
	`value` blob NOT NULL
);
--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`checkpoint` blob NOT NULL,
	`checkpoint_id` text NOT NULL,
	`checkpoint_ns` text NOT NULL,
	`metadata` blob NOT NULL,
	`thread_id` text NOT NULL,
	`type` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `composer_drafts` (
	`content` text NOT NULL,
	`revision` integer NOT NULL,
	`session_id` text PRIMARY KEY,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_composer_drafts_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `hook_usage` (
	`hook_id` text NOT NULL,
	`session_id` text NOT NULL,
	`used_count` integer NOT NULL,
	CONSTRAINT `fk_hook_usage_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `host_leases` (
	`expires_at` integer NOT NULL,
	`owner_id` text NOT NULL,
	`session_id` text PRIMARY KEY,
	CONSTRAINT `fk_host_leases_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `queue` (
	`content` text,
	`error` text,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`root_id` integer,
	`session_id` text NOT NULL,
	`status` text NOT NULL,
	CONSTRAINT `fk_queue_root_id_queue_id_fk` FOREIGN KEY (`root_id`) REFERENCES `queue`(`id`),
	CONSTRAINT `fk_queue_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT "queue_status" CHECK("status" in ('draft', 'pending', 'running', 'paused', 'done', 'canceled'))
);
--> statement-breakpoint
CREATE TABLE `sessions` (
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
CREATE TABLE `tool_cancellations` (
	`call_id` text NOT NULL,
	`requested_at` integer NOT NULL,
	`session_id` text NOT NULL,
	CONSTRAINT `fk_tool_cancellations_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_source` ON `messages` (`session_id`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_position` ON `messages` (`session_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_queue` ON `messages` (`queue_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reasoning_translations_identity` ON `reasoning_translations` (`session_id`,`message_id`,`target_language`);--> statement-breakpoint
CREATE UNIQUE INDEX `file_link_unit_owner` ON `file_link_units` (`session_id`,`owner_id`,`surface`,`unit_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkpoint_writes_identity` ON `checkpoint_writes` (`thread_id`,`checkpoint_ns`,`checkpoint_id`,`task_id`,`write_index`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkpoints_identity` ON `checkpoints` (`thread_id`,`checkpoint_ns`);--> statement-breakpoint
CREATE UNIQUE INDEX `hook_usage_identity` ON `hook_usage` (`session_id`,`hook_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tool_cancellations_identity` ON `tool_cancellations` (`session_id`,`call_id`);