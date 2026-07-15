CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role` enum('buyer','jeweller','admin') NOT NULL,
	`name` varchar(191) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(32),
	`passwordHash` varchar(512) NOT NULL,
	`businessName` varchar(191),
	`categories` varchar(255),
	`city` varchar(191),
	`rating` decimal(2,1) DEFAULT '4.5',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`jewellerId` int NOT NULL,
	`goldWeightGrams` decimal(8,2),
	`diamondWeightCarats` decimal(8,2),
	`makingCharges` int,
	`totalPrice` int NOT NULL,
	`message` text,
	`status` enum('pending','accepted','dismissed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`buyerId` int NOT NULL,
	`category` enum('gold','diamond-gold','stone-studded') NOT NULL,
	`imageUrl` text,
	`title` varchar(191) NOT NULL,
	`budgetMin` int,
	`budgetMax` int,
	`timeline` varchar(100),
	`notes` text,
	`status` enum('open','quoted','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `waitlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('buyer','jeweller') NOT NULL DEFAULT 'buyer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waitlist_id` PRIMARY KEY(`id`)
);
