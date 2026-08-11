CREATE TABLE `creditLedger` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jewellerId` int NOT NULL,
	`type` enum('subscription_allocation','topup','quote_debit','quote_refund','admin_grant','admin_deduct','topup_expiry','wallet_freeze','wallet_unfreeze') NOT NULL,
	`subscriptionDelta` int NOT NULL DEFAULT 0,
	`topupDelta` int NOT NULL DEFAULT 0,
	`adjustmentDelta` int NOT NULL DEFAULT 0,
	`subscriptionBalanceAfter` int NOT NULL,
	`topupBalanceAfter` int NOT NULL,
	`adjustmentBalanceAfter` int NOT NULL,
	`quoteId` int,
	`paymentRecordId` int,
	`adminId` int,
	`idempotencyKey` varchar(191) NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creditLedger_id` PRIMARY KEY(`id`),
	CONSTRAINT `creditLedger_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `creditWallets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jewellerId` int NOT NULL,
	`subscriptionCredits` int NOT NULL DEFAULT 0,
	`topupCredits` int NOT NULL DEFAULT 0,
	`adjustmentCredits` int NOT NULL DEFAULT 0,
	`isFrozen` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `creditWallets_id` PRIMARY KEY(`id`),
	CONSTRAINT `creditWallets_jewellerId_unique` UNIQUE(`jewellerId`)
);
--> statement-breakpoint
CREATE TABLE `jewellerSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jewellerId` int NOT NULL,
	`planCode` varchar(64) NOT NULL DEFAULT 'vv-pro-9999',
	`status` enum('active','past_due','cancelled','suspended') NOT NULL DEFAULT 'active',
	`monthlyCreditAllowance` int NOT NULL DEFAULT 500,
	`rolloverCap` int NOT NULL DEFAULT 1500,
	`currentPeriodStart` timestamp,
	`currentPeriodEnd` timestamp,
	`cancelledAt` timestamp,
	`provider` varchar(64),
	`providerSubscriptionId` varchar(191),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jewellerSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `jewellerSubscriptions_jewellerId_unique` UNIQUE(`jewellerId`),
	CONSTRAINT `jewellerSubscriptions_providerSubscriptionId_unique` UNIQUE(`providerSubscriptionId`)
);
--> statement-breakpoint
CREATE TABLE `paymentRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jewellerId` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`kind` enum('subscription','topup') NOT NULL,
	`status` enum('created','pending','paid','failed','refunded','cancelled') NOT NULL DEFAULT 'created',
	`amountPaise` int NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'INR',
	`creditsToIssue` int NOT NULL,
	`providerPaymentId` varchar(191),
	`providerOrderId` varchar(191),
	`providerSubscriptionId` varchar(191),
	`metadata` text,
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentRecords_providerPaymentId_unique` UNIQUE(`providerPaymentId`),
	CONSTRAINT `paymentRecords_providerOrderId_unique` UNIQUE(`providerOrderId`)
);
--> statement-breakpoint
CREATE TABLE `paymentWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(64) NOT NULL,
	`eventKey` varchar(255) NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`signatureValid` boolean NOT NULL DEFAULT false,
	`status` enum('received','processed','ignored','failed') NOT NULL DEFAULT 'received',
	`payload` text NOT NULL,
	`processingError` varchar(1000),
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `paymentWebhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentWebhookEvents_eventKey_unique` UNIQUE(`eventKey`)
);
