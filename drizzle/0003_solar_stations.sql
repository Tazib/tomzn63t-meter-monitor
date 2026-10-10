CREATE TABLE "solar_daily" (
	"station_id" uuid NOT NULL,
	"day" date NOT NULL,
	"generation_kwh" numeric(12, 3) DEFAULT '0' NOT NULL,
	"consumption_kwh" numeric(12, 3) DEFAULT '0' NOT NULL,
	"purchase_kwh" numeric(12, 3) DEFAULT '0' NOT NULL,
	"export_kwh" numeric(12, 3) DEFAULT '0' NOT NULL,
	"charge_kwh" numeric(12, 3) DEFAULT '0' NOT NULL,
	"discharge_kwh" numeric(12, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "solar_daily_station_id_day_pk" PRIMARY KEY("station_id","day")
);
--> statement-breakpoint
CREATE TABLE "solar_readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"station_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"generation_w" double precision,
	"consumption_w" double precision,
	"grid_w" double precision,
	"battery_w" double precision,
	"battery_soc" double precision
);
--> statement-breakpoint
CREATE TABLE "solar_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"deye_station_id" text NOT NULL,
	"name" text NOT NULL,
	"meter_id" uuid NOT NULL,
	"grid_draw_metered" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"backfilled_at" timestamp with time zone,
	"daily_synced_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "solar_daily" ADD CONSTRAINT "solar_daily_station_id_solar_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."solar_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_readings" ADD CONSTRAINT "solar_readings_station_id_solar_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."solar_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_stations" ADD CONSTRAINT "solar_stations_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_stations" ADD CONSTRAINT "solar_stations_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "solar_readings_station_ts_uq" ON "solar_readings" USING btree ("station_id","ts");--> statement-breakpoint
CREATE UNIQUE INDEX "solar_stations_deye_uq" ON "solar_stations" USING btree ("deye_station_id");--> statement-breakpoint
CREATE INDEX "solar_stations_meter_idx" ON "solar_stations" USING btree ("meter_id");