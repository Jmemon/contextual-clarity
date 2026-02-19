CREATE TABLE `recall_point_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`recall_point_id` text NOT NULL,
	`resource_id` text NOT NULL,
	`relevance` text,
	FOREIGN KEY (`recall_point_id`) REFERENCES `recall_points`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recall_point_resources_rp_idx` ON `recall_point_resources` (`recall_point_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`recall_set_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`content` text,
	`url` text,
	`image_data` text,
	`mime_type` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recall_set_id`) REFERENCES `recall_sets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resources_recall_set_idx` ON `resources` (`recall_set_id`);