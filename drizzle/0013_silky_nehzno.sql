CREATE TABLE "champion_meta_rollups" (
	"patch" varchar(32) NOT NULL,
	"region" varchar(12) NOT NULL,
	"queue_id" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"champion_id" integer NOT NULL,
	"champion_name" varchar(32) NOT NULL,
	"games" integer NOT NULL,
	"wins" integer NOT NULL,
	"role_games" integer NOT NULL,
	"bans" integer NOT NULL,
	"sampled_matches" integer NOT NULL,
	"average_kda" real NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_meta_rollups_patch_region_queue_id_role_champion_id_pk" PRIMARY KEY("patch","region","queue_id","role","champion_id")
);
--> statement-breakpoint
CREATE TABLE "meta_champion_bans" (
	"match_id" varchar(32) NOT NULL,
	"team_id" integer NOT NULL,
	"pick_turn" integer NOT NULL,
	"champion_id" integer NOT NULL,
	CONSTRAINT "meta_champion_bans_match_id_team_id_pick_turn_pk" PRIMARY KEY("match_id","team_id","pick_turn")
);
--> statement-breakpoint
CREATE TABLE "meta_champion_observations" (
	"match_id" varchar(32) NOT NULL,
	"participant_id" integer NOT NULL,
	"champion_id" integer NOT NULL,
	"champion_name" varchar(32) NOT NULL,
	"role" varchar(16) NOT NULL,
	"win" boolean NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	CONSTRAINT "meta_champion_observations_match_id_participant_id_pk" PRIMARY KEY("match_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "meta_collector_seeds" (
	"puuid" varchar(78) PRIMARY KEY NOT NULL,
	"platform" varchar(8) NOT NULL,
	"region" varchar(12) NOT NULL,
	"source" varchar(24) NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_collected_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "meta_sample_matches" (
	"match_id" varchar(32) PRIMARY KEY NOT NULL,
	"platform" varchar(8) NOT NULL,
	"region" varchar(12) NOT NULL,
	"queue_id" integer NOT NULL,
	"patch" varchar(32) NOT NULL,
	"game_creation" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_champion_bans" ADD CONSTRAINT "meta_champion_bans_match_id_meta_sample_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."meta_sample_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_champion_observations" ADD CONSTRAINT "meta_champion_observations_match_id_meta_sample_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."meta_sample_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_rollups_lookup_idx" ON "champion_meta_rollups" USING btree ("region","queue_id","patch","role");--> statement-breakpoint
CREATE INDEX "meta_bans_champion_idx" ON "meta_champion_bans" USING btree ("champion_id");--> statement-breakpoint
CREATE INDEX "meta_observations_champion_idx" ON "meta_champion_observations" USING btree ("champion_id","role");--> statement-breakpoint
CREATE INDEX "meta_seeds_next_idx" ON "meta_collector_seeds" USING btree ("platform","last_collected_at");--> statement-breakpoint
CREATE INDEX "meta_matches_filter_idx" ON "meta_sample_matches" USING btree ("region","queue_id","patch","game_creation");