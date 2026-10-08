CREATE TABLE "meter_balances" (
	"meter_id" uuid PRIMARY KEY NOT NULL,
	"balance_tk" numeric(12, 2) NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"cycle_start" date NOT NULL,
	"cycle_kwh" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_recharges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meter_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"amount_tk" numeric(12, 2) NOT NULL,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "meter_balances" ADD CONSTRAINT "meter_balances_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_recharges" ADD CONSTRAINT "meter_recharges_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_recharges" ADD CONSTRAINT "meter_recharges_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meter_recharges_meter_at_idx" ON "meter_recharges" USING btree ("meter_id","at");