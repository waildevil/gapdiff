CREATE TABLE "account_claims" (
	"user_id" text NOT NULL,
	"puuid" varchar(78) NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_via" varchar(24),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_claims_user_id_puuid_pk" PRIMARY KEY("user_id","puuid")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"puuid" varchar(78) PRIMARY KEY NOT NULL,
	"game_name" text NOT NULL,
	"tag_line" varchar(8) NOT NULL,
	"platform" varchar(8) NOT NULL,
	"summoner_id" text,
	"profile_icon_id" integer,
	"summoner_level" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"group_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(16) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_memberships_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"is_private" boolean DEFAULT true NOT NULL,
	"owner_id" text,
	"discord_webhook_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "icon_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"puuid" varchar(78) NOT NULL,
	"requested_icon_id" integer NOT NULL,
	"previous_icon_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" varchar(32) PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_participants" (
	"match_id" varchar(32) NOT NULL,
	"puuid" varchar(78) NOT NULL,
	"participant_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"win" boolean NOT NULL,
	"champion_id" integer NOT NULL,
	"champion_name" varchar(32) NOT NULL,
	"role" varchar(16) NOT NULL,
	"kills" integer NOT NULL,
	"deaths" integer NOT NULL,
	"assists" integer NOT NULL,
	"kill_participation" real NOT NULL,
	"death_share" real NOT NULL,
	"damage_share" real NOT NULL,
	"gold_share" real NOT NULL,
	"damage_taken_share" real NOT NULL,
	"objective_damage_share" real NOT NULL,
	"cs_per_min" real NOT NULL,
	"vision_per_min" real NOT NULL,
	"vision_score" integer NOT NULL,
	"wards_placed" integer NOT NULL,
	"control_wards" integer NOT NULL,
	"solo_kills" integer DEFAULT 0 NOT NULL,
	"performance_score" double precision,
	"performance_raw" double precision,
	"opponent_raw" double precision,
	CONSTRAINT "match_participants_match_id_puuid_pk" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"match_id" varchar(32) PRIMARY KEY NOT NULL,
	"platform" varchar(8) NOT NULL,
	"queue_id" integer NOT NULL,
	"game_mode" varchar(32) NOT NULL,
	"game_version" varchar(32) NOT NULL,
	"game_creation" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"scorable" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL,
	"timeline" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"puuid" varchar(78) NOT NULL,
	"queue_type" varchar(24) NOT NULL,
	"tier" varchar(16) NOT NULL,
	"division" varchar(4) NOT NULL,
	"league_points" integer NOT NULL,
	"rank_points" integer NOT NULL,
	"wins" integer NOT NULL,
	"losses" integer NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"puuid" varchar(78) PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone,
	"backfilled_through" timestamp with time zone,
	"backfill_complete" boolean DEFAULT false NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "tracked_accounts" (
	"group_id" integer NOT NULL,
	"puuid" varchar(78) NOT NULL,
	"nickname" text,
	"added_by" text,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_accounts_group_id_puuid_pk" PRIMARY KEY("group_id","puuid")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_claims" ADD CONSTRAINT "account_claims_puuid_accounts_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."accounts"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icon_challenges" ADD CONSTRAINT "icon_challenges_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_match_id_matches_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("match_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_snapshots" ADD CONSTRAINT "rank_snapshots_puuid_accounts_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."accounts"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_puuid_accounts_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."accounts"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_accounts" ADD CONSTRAINT "tracked_accounts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_accounts" ADD CONSTRAINT "tracked_accounts_puuid_accounts_puuid_fk" FOREIGN KEY ("puuid") REFERENCES "public"."accounts"("puuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_accounts" ADD CONSTRAINT "tracked_accounts_added_by_auth_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_riot_id_idx" ON "accounts" USING btree ("game_name","tag_line","platform");--> statement-breakpoint
CREATE INDEX "icon_challenges_user_idx" ON "icon_challenges" USING btree ("user_id","puuid");--> statement-breakpoint
CREATE INDEX "invites_group_idx" ON "invites" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "participants_puuid_idx" ON "match_participants" USING btree ("puuid");--> statement-breakpoint
CREATE INDEX "participants_champion_idx" ON "match_participants" USING btree ("champion_id");--> statement-breakpoint
CREATE INDEX "matches_game_creation_idx" ON "matches" USING btree ("game_creation");--> statement-breakpoint
CREATE INDEX "rank_snapshots_puuid_idx" ON "rank_snapshots" USING btree ("puuid","captured_at");