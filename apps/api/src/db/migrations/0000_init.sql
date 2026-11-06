CREATE TYPE "public"."cancel_reason" AS ENUM('no-show', 'advance');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."credential_type" AS ENUM('license', 'tb_screening', 'other');--> statement-breakpoint
CREATE TYPE "public"."file_bucket" AS ENUM('public_assets', 'private_credentials');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'manager', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."nurse_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('open', 'filled', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."tb_test_type" AS ENUM('igra', 'tst', 'chest_xray', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('nurse', 'agency', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE SEQUENCE "public"."shift_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 4 CACHE 1;--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'US' NOT NULL,
	"logo_file_id" text,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agency_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agency_id" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_memberships_revoked_pair" CHECK (("agency_memberships"."revoked_at" IS NULL) = ("agency_memberships"."revoked_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" char(2) NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"timezone" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"phone" text,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "facilities_latitude_range" CHECK ("facilities"."latitude" IS NULL OR "facilities"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "facilities_longitude_range" CHECK ("facilities"."longitude" IS NULL OR "facilities"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
CREATE TABLE "hospital_networks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_timezone" text DEFAULT 'America/New_York' NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "network_agencies" (
	"network_id" text NOT NULL,
	"agency_id" text NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_agencies_network_id_agency_id_pk" PRIMARY KEY("network_id","agency_id")
);
--> statement-breakpoint
CREATE TABLE "network_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"network_id" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nurse_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"license_type" text,
	"primary_state" char(2),
	"status" "nurse_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nurse_profiles_license_type" CHECK ("nurse_profiles"."license_type" IS NULL OR "nurse_profiles"."license_type" IN ('RN','LPN','CNA'))
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"avatar_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_full_name_nonblank" CHECK (length(trim("user_profiles"."full_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
CREATE TABLE "shift_cancellations" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_id" text NOT NULL,
	"reason" "cancel_reason" NOT NULL,
	"previous_nurse_id" text NOT NULL,
	"cancelled_by" text NOT NULL,
	"cancelled_by_role" "user_role" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY DEFAULT 'shift-' || nextval('shift_id_seq') NOT NULL,
	"network_id" text NOT NULL,
	"agency_id" text NOT NULL,
	"facility_id" text,
	"role" text NOT NULL,
	"shift_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"timezone" text NOT NULL,
	"status" "shift_status" DEFAULT 'open' NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"description" text,
	"pay_rate_cents" integer,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "shifts_role_valid" CHECK ("shifts"."role" IN ('RN','LPN','CNA')),
	CONSTRAINT "shifts_times_differ" CHECK ("shifts"."start_time" <> "shifts"."end_time"),
	CONSTRAINT "shifts_pay_nonneg" CHECK ("shifts"."pay_rate_cents" IS NULL OR "shifts"."pay_rate_cents" >= 0),
	CONSTRAINT "shifts_filled_iff_claimed" CHECK (("shifts"."status" = 'filled') = ("shifts"."claimed_by" IS NOT NULL)),
	CONSTRAINT "shifts_filled_has_claimed_at" CHECK ("shifts"."status" <> 'filled' OR "shifts"."claimed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"nurse_id" text NOT NULL,
	"type" "credential_type" NOT NULL,
	"license_type" text,
	"number" text,
	"issuing_state" char(2),
	"issued_on" date,
	"expires_on" date,
	"screened_on" date,
	"tb_test_type" "tb_test_type",
	"recheck_due_on" date,
	"file_id" text,
	"status" "credential_status" DEFAULT 'pending' NOT NULL,
	"uploaded_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "credentials_license_needs_expiry" CHECK ("credentials"."type" <> 'license' OR "credentials"."expires_on" IS NOT NULL),
	CONSTRAINT "credentials_tb_needs_screened_on" CHECK ("credentials"."type" <> 'tb_screening' OR "credentials"."screened_on" IS NOT NULL),
	CONSTRAINT "credentials_expiry_after_issue" CHECK ("credentials"."expires_on" IS NULL OR "credentials"."issued_on" IS NULL OR "credentials"."expires_on" >= "credentials"."issued_on"),
	CONSTRAINT "credentials_reviewed_iff_not_pending" CHECK (("credentials"."status" = 'pending') = ("credentials"."reviewed_at" IS NULL)),
	CONSTRAINT "credentials_license_type" CHECK ("credentials"."license_type" IS NULL OR "credentials"."license_type" IN ('RN','LPN','CNA'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text,
	"actor_role" "user_role",
	"network_id" text,
	"agency_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"changes" jsonb,
	"request_id" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" "file_bucket" NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "files_size_range" CHECK ("files"."size_bytes" > 0 AND "files"."size_bytes" <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_user_id" text,
	"recipient_email" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" text,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_memberships" ADD CONSTRAINT "agency_memberships_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_network_id_hospital_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."hospital_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_agencies" ADD CONSTRAINT "network_agencies_network_id_hospital_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."hospital_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_agencies" ADD CONSTRAINT "network_agencies_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_memberships" ADD CONSTRAINT "network_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_memberships" ADD CONSTRAINT "network_memberships_network_id_hospital_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."hospital_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nurse_profiles" ADD CONSTRAINT "nurse_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nurse_profiles" ADD CONSTRAINT "nurse_profiles_network_id_hospital_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."hospital_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cancellations" ADD CONSTRAINT "shift_cancellations_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cancellations" ADD CONSTRAINT "shift_cancellations_previous_nurse_id_nurse_profiles_user_id_fk" FOREIGN KEY ("previous_nurse_id") REFERENCES "public"."nurse_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_cancellations" ADD CONSTRAINT "shift_cancellations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_network_id_hospital_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."hospital_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_claimed_by_nurse_profiles_user_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."nurse_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_network_agency_fk" FOREIGN KEY ("network_id","agency_id") REFERENCES "public"."network_agencies"("network_id","agency_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_nurse_id_nurse_profiles_user_id_fk" FOREIGN KEY ("nurse_id") REFERENCES "public"."nurse_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replaced_by_refresh_tokens_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."refresh_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_name_uq" ON "agencies" USING btree (lower("name")) WHERE "agencies"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agency_memberships_active_uq" ON "agency_memberships" USING btree ("user_id","agency_id") WHERE "agency_memberships"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "agency_memberships_user_active_idx" ON "agency_memberships" USING btree ("user_id") WHERE "agency_memberships"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "network_memberships_active_uq" ON "network_memberships" USING btree ("user_id","network_id") WHERE "network_memberships"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shift_cancellations_shift_idx" ON "shift_cancellations" USING btree ("shift_id","created_at");--> statement-breakpoint
CREATE INDEX "shift_cancellations_nurse_idx" ON "shift_cancellations" USING btree ("previous_nurse_id");--> statement-breakpoint
CREATE INDEX "shifts_agency_status_idx" ON "shifts" USING btree ("agency_id","status") WHERE "shifts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shifts_network_status_date_idx" ON "shifts" USING btree ("network_id","status","shift_date") WHERE "shifts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "shifts_claimed_by_idx" ON "shifts" USING btree ("claimed_by") WHERE "shifts"."claimed_by" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "credentials_nurse_type_idx" ON "credentials" USING btree ("nurse_id","type") WHERE "credentials"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_network_idx" ON "audit_log" USING btree ("network_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_agency_idx" ON "audit_log" USING btree ("agency_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "files_bucket_key_uq" ON "files" USING btree ("bucket","object_key");--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("status","next_attempt_at") WHERE "notifications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_active_idx" ON "refresh_tokens" USING btree ("user_id") WHERE "refresh_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");