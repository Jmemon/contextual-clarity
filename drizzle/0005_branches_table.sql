DROP TABLE IF EXISTS `rabbithole_events`;
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parent_branch_id` text,
	`branch_point_message_id` text NOT NULL,
	`topic` text NOT NULL,
	`status` text DEFAULT 'detected' NOT NULL,
	`summary` text,
	`depth` integer DEFAULT 1 NOT NULL,
	`related_recall_point_ids` text DEFAULT '[]' NOT NULL,
	`user_initiated` integer NOT NULL,
	`conversation` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_point_message_id`) REFERENCES `session_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `branches_session_id_idx` ON `branches` (`session_id`);
--> statement-breakpoint
CREATE INDEX `branches_parent_branch_id_idx` ON `branches` (`parent_branch_id`);
--> statement-breakpoint
ALTER TABLE `session_messages` ADD `branch_id` text;
--> statement-breakpoint
CREATE INDEX `session_messages_branch_id_idx` ON `session_messages` (`branch_id`);
