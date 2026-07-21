CREATE TABLE `demos` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('TYPE_1','TYPE_2','TYPE_3') NOT NULL DEFAULT 'TYPE_1',
	`parentId` bigint unsigned,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `demos_id` PRIMARY KEY(`id`),
	CONSTRAINT `demos_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `demos` ADD CONSTRAINT `parent_id_fk` FOREIGN KEY (`parentId`) REFERENCES `demos`(`id`) ON DELETE no action ON UPDATE no action;