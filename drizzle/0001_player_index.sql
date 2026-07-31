CREATE TABLE "known_players" (
	"puuid" varchar(78) PRIMARY KEY NOT NULL,
	"game_name" text NOT NULL,
	"tag_line" varchar(8) NOT NULL,
	"platform" varchar(8) NOT NULL,
	"games_seen" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "known_players_name_idx" ON "known_players" USING btree ("game_name");--> statement-breakpoint
CREATE INDEX "known_players_seen_idx" ON "known_players" USING btree ("games_seen");