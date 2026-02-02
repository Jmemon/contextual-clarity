CREATE TABLE `recall_points` (
	`id` text PRIMARY KEY NOT NULL,
	`recall_set_id` text NOT NULL,
	`content` text NOT NULL,
	`context` text NOT NULL,
	`fsrs_difficulty` real NOT NULL,
	`fsrs_stability` real NOT NULL,
	`fsrs_due` integer NOT NULL,
	`fsrs_last_review` integer,
	`fsrs_reps` integer DEFAULT 0 NOT NULL,
	`fsrs_lapses` integer DEFAULT 0 NOT NULL,
	`fsrs_state` text DEFAULT 'new' NOT NULL,
	`recall_history` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recall_set_id`) REFERENCES `recall_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recall_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`discussion_system_prompt` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` integer NOT NULL,
	`token_count` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`recall_set_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`target_recall_point_ids` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`recall_set_id`) REFERENCES `recall_sets`(`id`) ON UPDATE no action ON DELETE no action
);
