CREATE TABLE `goldPrices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pricePerGram24kt` decimal(12,2) NOT NULL,
	`pricePerGram9kt` decimal(12,2) NOT NULL,
	`pricePerGram14kt` decimal(12,2) NOT NULL,
	`pricePerGram18kt` decimal(12,2) NOT NULL,
	`rawPricePerOunce` decimal(14,2),
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `goldPrices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `instagramWhatsappLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`instagramUsername` varchar(64) NOT NULL,
	`whatsappNumber` varchar(32) NOT NULL,
	`verified` boolean NOT NULL DEFAULT false,
	`verificationCode` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instagramWhatsappLinks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappOtps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`whatsappNumber` varchar(32) NOT NULL,
	`otp` varchar(6) NOT NULL,
	`used` boolean NOT NULL DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsappOtps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `whatsappNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `quotes` ADD `goldPurity` enum('9kt','14kt','18kt') DEFAULT '18kt';--> statement-breakpoint
ALTER TABLE `quotes` ADD `goldPricePerGram` decimal(10,2);