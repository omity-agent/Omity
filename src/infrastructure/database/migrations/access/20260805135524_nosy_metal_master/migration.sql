CREATE TABLE `access_sessions` (
	`expires_at` integer NOT NULL,
	`token_hash` blob PRIMARY KEY
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`challenge` text NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`purpose` text NOT NULL,
	CONSTRAINT "challenges_purpose" CHECK("purpose" in ('registration', 'authentication'))
);
--> statement-breakpoint
CREATE TABLE `credentials` (
	`counter` integer NOT NULL,
	`created_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`public_key` blob NOT NULL,
	`transports_json` text
);
--> statement-breakpoint
CREATE TABLE `registration_tickets` (
	`expires_at` integer NOT NULL,
	`token_hash` blob PRIMARY KEY
);
