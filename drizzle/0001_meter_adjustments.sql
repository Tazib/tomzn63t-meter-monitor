CREATE TABLE "meter_adjustments" (
	"meter_id" uuid NOT NULL,
	"cycle_start" date NOT NULL,
	"kwh" numeric(12, 3) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meter_adjustments_meter_id_cycle_start_pk" PRIMARY KEY("meter_id","cycle_start")
);
--> statement-breakpoint
ALTER TABLE "meter_adjustments" ADD CONSTRAINT "meter_adjustments_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE cascade ON UPDATE no action;