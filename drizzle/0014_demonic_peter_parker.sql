CREATE TABLE "champion_meta_tier_rollups" (
	"patch" varchar(32) NOT NULL,
	"region" varchar(12) NOT NULL,
	"queue_id" integer NOT NULL,
	"tier" varchar(16) NOT NULL,
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
	CONSTRAINT "champion_meta_tier_rollups_patch_region_queue_id_tier_role_champion_id_pk" PRIMARY KEY("patch","region","queue_id","tier","role","champion_id")
);
--> statement-breakpoint
CREATE TABLE "meta_match_cohorts" (
	"match_id" varchar(32) NOT NULL,
	"seed_puuid" varchar(78) NOT NULL,
	"tier" varchar(16) NOT NULL,
	"division" varchar(4),
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_match_cohorts_match_id_seed_puuid_pk" PRIMARY KEY("match_id","seed_puuid")
);
--> statement-breakpoint
ALTER TABLE "meta_collector_seeds" ADD COLUMN "rank_tier" varchar(16);--> statement-breakpoint
ALTER TABLE "meta_collector_seeds" ADD COLUMN "rank_division" varchar(4);--> statement-breakpoint
ALTER TABLE "meta_match_cohorts" ADD CONSTRAINT "meta_match_cohorts_match_id_meta_sample_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."meta_sample_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_match_cohorts" ADD CONSTRAINT "meta_match_cohorts_seed_puuid_meta_collector_seeds_puuid_fk" FOREIGN KEY ("seed_puuid") REFERENCES "public"."meta_collector_seeds"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_tier_rollups_lookup_idx" ON "champion_meta_tier_rollups" USING btree ("tier","region","queue_id","patch","role");--> statement-breakpoint
CREATE INDEX "meta_cohorts_tier_match_idx" ON "meta_match_cohorts" USING btree ("tier","match_id");