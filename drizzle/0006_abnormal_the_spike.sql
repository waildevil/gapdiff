ALTER TABLE "duel_participants" ADD COLUMN "end_tier" varchar(16);--> statement-breakpoint
ALTER TABLE "duel_participants" ADD COLUMN "end_division" varchar(4);--> statement-breakpoint
ALTER TABLE "duel_participants" ADD COLUMN "end_league_points" integer;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "settled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "duels" ADD COLUMN "winner_puuid" varchar(78);--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_winner_puuid_accounts_puuid_fk" FOREIGN KEY ("winner_puuid") REFERENCES "public"."accounts"("puuid") ON DELETE set null ON UPDATE no action;