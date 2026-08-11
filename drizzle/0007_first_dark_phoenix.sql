CREATE TABLE `portfolioItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jewellerId` int NOT NULL,
	`imageUrl` varchar(1000) NOT NULL,
	`caption` varchar(500),
	`sortOrder` int NOT NULL DEFAULT 0,
	`source` enum('uploaded','quoted') NOT NULL DEFAULT 'uploaded',
	`requestId` int,
	`isPromoted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portfolioItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `address` varchar(500);--> statement-breakpoint
ALTER TABLE `accounts` ADD `website` varchar(500);--> statement-breakpoint
ALTER TABLE `accounts` ADD `instagramUrl` varchar(500);--> statement-breakpoint
ALTER TABLE `accounts` ADD `about` varchar(2000);--> statement-breakpoint
ALTER TABLE `accounts` ADD `logoUrl` varchar(1000);--> statement-breakpoint
ALTER TABLE `accounts` ADD `profileSlug` varchar(191);--> statement-breakpoint
ALTER TABLE `accounts` ADD `profileStatus` enum('draft','pending','approved','rejected','suspended') DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `profileReviewNote` varchar(1000);--> statement-breakpoint
ALTER TABLE `accounts` ADD `profileApprovedAt` timestamp;--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_profileSlug_unique` UNIQUE(`profileSlug`);