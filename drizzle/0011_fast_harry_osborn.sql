CREATE TABLE "search_history" (
	"user_id" text NOT NULL,
	"puuid" varchar(78) NOT NULL,
	"game_name" text NOT NULL,
	"tag_line" varchar(8) NOT NULL,
	"platform" varchar(8) NOT NULL,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_history_user_id_puuid_pk" PRIMARY KEY("user_id","puuid")
);
--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_history_user_idx" ON "search_history" USING btree ("user_id","searched_at");