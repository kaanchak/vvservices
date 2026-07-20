CREATE TABLE `chatThreads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`buyerId` int NOT NULL,
	`jewellerId` int NOT NULL,
	`quoteId` int NOT NULL,
	`status` enum('open','buyer_declined','jeweller_withdrawn') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`closedAt` timestamp,
	CONSTRAINT `chatThreads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jewelleryReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`reportedJewellerId` int NOT NULL,
	`threadId` int NOT NULL,
	`reason` text NOT NULL,
	`status` enum('pending','reviewed') NOT NULL DEFAULT 'pending',
	`adminNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`reviewedAt` timestamp,
	CONSTRAINT `jewelleryReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`senderId` int NOT NULL,
	`senderRole` enum('buyer','jeweller','system') NOT NULL,
	`content` text NOT NULL,
	`requoteId` int,
	`type` enum('text','requote','system') NOT NULL DEFAULT 'text',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`quoteId` int NOT NULL,
	`buyerId` int NOT NULL,
	`jewellerId` int NOT NULL,
	`amount` int NOT NULL,
	`platformFeePercent` decimal(5,2) NOT NULL DEFAULT '5.00',
	`status` enum('pending_payment','paid','fulfilled','cancelled') NOT NULL DEFAULT 'pending_payment',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` int NOT NULL,
	`jewellerId` int NOT NULL,
	`newPrice` int NOT NULL,
	`newGoldPurity` enum('9kt','14kt','18kt'),
	`newGoldWeightGrams` decimal(8,2),
	`newDiamondWeightCarats` decimal(8,2),
	`newMakingCharges` int,
	`reason` text NOT NULL,
	`status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `requotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `requests` MODIFY COLUMN `status` enum('open','quoted','paused','closed') NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE `quotes` ADD `preMessage` text;--> statement-breakpoint
ALTER TABLE `requests` ADD `activeQuoteCount` int DEFAULT 0 NOT NULL;