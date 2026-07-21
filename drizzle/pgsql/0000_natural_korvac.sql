CREATE TYPE "public"."demo_type" AS ENUM('TYPE_1', 'TYPE_2', 'TYPE_3');--> statement-breakpoint
CREATE TABLE "demos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "demos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" varchar(100) NOT NULL,
	"type" "demo_type" DEFAULT 'TYPE_1' NOT NULL,
	"parentId" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "demos_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "demos" ADD CONSTRAINT "parent_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."demos"("id") ON DELETE no action ON UPDATE no action;