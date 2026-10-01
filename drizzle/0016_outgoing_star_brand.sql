CREATE TABLE "meta_champion_loadouts" (
	"match_id" varchar(32) NOT NULL,
	"participant_id" integer NOT NULL,
	"champion_id" integer NOT NULL,
	"champion_name" varchar(32) NOT NULL,
	"role" varchar(16) NOT NULL,
	"team_id" integer NOT NULL,
	"win" boolean NOT NULL,
	"opponent_champion_id" integer,
	"opponent_champion_name" varchar(32),
	"spell_1_id" integer NOT NULL,
	"spell_2_id" integer NOT NULL,
	"item_ids" jsonb NOT NULL,
	"primary_rune_id" integer,
	"secondary_rune_style_id" integer,
	"skill_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "meta_champion_loadouts_match_id_participant_id_pk" PRIMARY KEY("match_id","participant_id")
);
--> statement-breakpoint
ALTER TABLE "meta_champion_loadouts" ADD CONSTRAINT "meta_champion_loadouts_match_id_meta_sample_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."meta_sample_matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_loadouts_champion_role_idx" ON "meta_champion_loadouts" USING btree ("champion_id","role");--> statement-breakpoint
CREATE INDEX "meta_loadouts_opponent_idx" ON "meta_champion_loadouts" USING btree ("opponent_champion_id");