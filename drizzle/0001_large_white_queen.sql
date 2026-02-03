CREATE TABLE `message_timings` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`role` text NOT NULL,
	`timestamp` integer NOT NULL,
	`response_latency_ms` integer,
	`token_count` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `session_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `message_timings_session_id_idx` ON `message_timings` (`session_id`);--> statement-breakpoint
CREATE TABLE `rabbithole_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`topic` text NOT NULL,
	`trigger_message_index` integer NOT NULL,
	`return_message_index` integer,
	`depth` integer NOT NULL,
	`related_recall_point_ids` text DEFAULT '[]' NOT NULL,
	`user_initiated` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rabbithole_events_session_id_idx` ON `rabbithole_events` (`session_id`);--> statement-breakpoint
CREATE TABLE `recall_outcomes` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`recall_point_id` text NOT NULL,
	`success` integer NOT NULL,
	`confidence` real NOT NULL,
	`rating` text,
	`reasoning` text,
	`message_index_start` integer NOT NULL,
	`message_index_end` integer NOT NULL,
	`time_spent_ms` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recall_point_id`) REFERENCES `recall_points`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recall_outcomes_session_id_idx` ON `recall_outcomes` (`session_id`);--> statement-breakpoint
CREATE INDEX `recall_outcomes_recall_point_id_idx` ON `recall_outcomes` (`recall_point_id`);--> statement-breakpoint
CREATE TABLE `session_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`active_time_ms` integer NOT NULL,
	`avg_user_response_time_ms` integer NOT NULL,
	`avg_assistant_response_time_ms` integer NOT NULL,
	`recall_points_attempted` integer NOT NULL,
	`recall_points_successful` integer NOT NULL,
	`recall_points_failed` integer NOT NULL,
	`overall_recall_rate` real NOT NULL,
	`avg_confidence` real NOT NULL,
	`total_messages` integer NOT NULL,
	`user_messages` integer NOT NULL,
	`assistant_messages` integer NOT NULL,
	`avg_message_length` real NOT NULL,
	`rabbithole_count` integer DEFAULT 0 NOT NULL,
	`total_rabbithole_time_ms` integer DEFAULT 0 NOT NULL,
	`avg_rabbithole_depth` real DEFAULT 0 NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`estimated_cost_usd` real NOT NULL,
	`engagement_score` integer NOT NULL,
	`calculated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_metrics_session_id_unique` ON `session_metrics` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_metrics_session_id_idx` ON `session_metrics` (`session_id`);