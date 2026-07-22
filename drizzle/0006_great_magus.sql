CREATE TABLE `exchangeRates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromCurrency` varchar(8) NOT NULL,
	`rateToInr` decimal(16,6) NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchangeRates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `requests` ADD `originalPrice` varchar(64);--> statement-breakpoint
ALTER TABLE `requests` ADD `originalCurrency` varchar(8);