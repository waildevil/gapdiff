ALTER TABLE "duels" DROP CONSTRAINT "duels_group_id_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "duels" DROP CONSTRAINT "duels_created_by_auth_users_id_fk";
--> statement-breakpoint
DROP INDEX "duels_group_idx";--> statement-breakpoint
ALTER TABLE "duels" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "duel_participants" ADD COLUMN "invited_user_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "duel_participants" ADD COLUMN "status" varchar(16) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "duel_participants" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "duel_participants" ADD CONSTRAINT "duel_participants_invited_user_id_auth_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duels" ADD CONSTRAINT "duels_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duel_participants_invited_idx" ON "duel_participants" USING btree ("invited_user_id");--> statement-breakpoint
CREATE INDEX "duels_created_by_idx" ON "duels" USING btree ("created_by");--> statement-breakpoint
ALTER TABLE "duels" DROP COLUMN "group_id";