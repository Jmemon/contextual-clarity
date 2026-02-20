ALTER TABLE `sessions` ADD `recalled_point_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `paused_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `resumed_at` integer;