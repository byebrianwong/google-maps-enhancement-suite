CREATE TABLE `criteria` (
	`id` text PRIMARY KEY NOT NULL,
	`type_id` text NOT NULL,
	`label` text NOT NULL,
	`low_label` text NOT NULL,
	`high_label` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `place_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `origins` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text DEFAULT '🏠' NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `place_type_tags` (
	`place_id` text NOT NULL,
	`type_id` text NOT NULL,
	PRIMARY KEY(`place_id`, `type_id`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `place_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `place_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`emoji` text NOT NULL,
	`color` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`osm_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ratings` (
	`place_id` text NOT NULL,
	`criterion_id` text NOT NULL,
	`value` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`place_id`, `criterion_id`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criterion_id`) REFERENCES `criteria`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `travel_times` (
	`origin_id` text NOT NULL,
	`place_id` text NOT NULL,
	`mode` text NOT NULL,
	`seconds` integer NOT NULL,
	`meters` integer NOT NULL,
	`provider` text NOT NULL,
	`computed_at` integer NOT NULL,
	PRIMARY KEY(`origin_id`, `place_id`, `mode`),
	FOREIGN KEY (`origin_id`) REFERENCES `origins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`type_id` text,
	`visited_at` integer NOT NULL,
	`rating` integer,
	`note` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_id`) REFERENCES `place_types`(`id`) ON UPDATE no action ON DELETE set null
);
