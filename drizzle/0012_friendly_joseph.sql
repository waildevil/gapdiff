CREATE TABLE "activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"puuid" varchar(78) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"game_id" text,
	"queue_id" integer,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_live_state" (
	"puuid" varchar(78) PRIMARY KEY NOT NULL,
	"live" boolean DEFAULT false NOT NULL,
	"game_id" text,
	"queue_id" integer,
	"started_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_puuid_accounts_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."accounts"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_live_state" ADD CONSTRAINT "player_live_state_puuid_accounts_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."accounts"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_created_idx" ON "activity_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_events_puuid_idx" ON "activity_events" USING btree ("puuid","created_at");