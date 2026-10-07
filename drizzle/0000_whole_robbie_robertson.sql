CREATE TYPE "public"."connection_type" AS ENUM('prepaid', 'postpaid');--> statement-breakpoint
CREATE TYPE "public"."device_source" AS ENUM('grid', 'solar');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meter_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"tariff_version_id" uuid,
	"kwh" numeric(12, 3) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"breakdown" jsonb NOT NULL,
	"solar_kwh" numeric(12, 3),
	"solar_saving" numeric(12, 2),
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_energy" (
	"device_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kwh" numeric(12, 3) DEFAULT '0' NOT NULL,
	CONSTRAINT "daily_energy_device_id_day_pk" PRIMARY KEY("device_id","day")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tuya_device_id" text NOT NULL,
	"name" text NOT NULL,
	"source" "device_source" NOT NULL,
	"meter_id" uuid NOT NULL,
	"inverter_input_device_id" uuid,
	"energy_scale" integer DEFAULT 2 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_energy_kwh" numeric(14, 3),
	"last_seen_at" timestamp with time zone,
	"online" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_tuya_device_id_unique" UNIQUE("tuya_device_id")
);
--> statement-breakpoint
CREATE TABLE "meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"meter_no" text NOT NULL,
	"label" text,
	"utility" text,
	"connection_type" "connection_type" DEFAULT 'prepaid' NOT NULL,
	"tariff_plan_id" uuid NOT NULL,
	"sanctioned_load_kw" numeric(8, 2) DEFAULT '0' NOT NULL,
	"meter_rent" numeric(10, 2) DEFAULT '0' NOT NULL,
	"rebate_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"billing_cycle_day" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meters_cycle_day_ck" CHECK ("meters"."billing_cycle_day" between 1 and 28)
);
--> statement-breakpoint
CREATE TABLE "profile_members" (
	"profile_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "profile_members_profile_id_user_id_pk" PRIMARY KEY("profile_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tuya_uid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"energy_kwh" numeric(14, 3),
	"power_w" double precision,
	"voltage_v" double precision,
	"current_a" double precision,
	"power_factor" double precision,
	"frequency_hz" double precision,
	"leakage_ma" double precision,
	"temp_c" double precision
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tariff_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_slabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"from_kwh" numeric(10, 2) NOT NULL,
	"to_kwh" numeric(10, 2),
	"rate" numeric(10, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"lifeline_max_kwh" numeric(10, 2),
	"lifeline_rate" numeric(10, 4),
	"demand_charge_per_kw" numeric(10, 2) DEFAULT '0' NOT NULL,
	"vat_percent" numeric(5, 2) DEFAULT '5' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_tariff_version_id_tariff_versions_id_fk" FOREIGN KEY ("tariff_version_id") REFERENCES "public"."tariff_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_energy" ADD CONSTRAINT "daily_energy_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_tariff_plan_id_tariff_plans_id_fk" FOREIGN KEY ("tariff_plan_id") REFERENCES "public"."tariff_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_members" ADD CONSTRAINT "profile_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_members" ADD CONSTRAINT "profile_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_plans" ADD CONSTRAINT "tariff_plans_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_slabs" ADD CONSTRAINT "tariff_slabs_version_id_tariff_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."tariff_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD CONSTRAINT "tariff_versions_plan_id_tariff_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tariff_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_meter_period_uq" ON "bills" USING btree ("meter_id","period_start");--> statement-breakpoint
CREATE INDEX "devices_meter_idx" ON "devices" USING btree ("meter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meters_meter_no_uq" ON "meters" USING btree ("meter_no");--> statement-breakpoint
CREATE INDEX "readings_device_ts_idx" ON "readings" USING btree ("device_id","ts");--> statement-breakpoint
CREATE INDEX "tariff_slabs_version_idx" ON "tariff_slabs" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_versions_plan_effective_uq" ON "tariff_versions" USING btree ("plan_id","effective_from");