CREATE TYPE "public"."timesheet_status" AS ENUM('submitted', 'approved', 'disputed');--> statement-breakpoint
CREATE TABLE "inspection_packages" (
	"id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"agency_id" text,
	"created_by" text NOT NULL,
	"nurse_ids" text[] NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"include_documents" boolean DEFAULT false NOT NULL,
	"include_tb_documents" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_packages_period" CHECK ("inspection_packages"."period_to" >= "inspection_packages"."period_from"),
	CONSTRAINT "inspection_packages_nurses" CHECK (cardinality("inspection_packages"."nurse_ids") BETWEEN 1 AND 200),
	CONSTRAINT "inspection_packages_tb_needs_docs" CHECK (NOT "inspection_packages"."include_tb_documents" OR "inspection_packages"."include_documents")
);
--> statement-breakpoint
CREATE TABLE "timesheets" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_id" text NOT NULL,
	"nurse_id" text NOT NULL,
	"clock_in" time NOT NULL,
	"clock_out" time NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"note" text,
	"status" timesheet_status DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "timesheets_break_range" CHECK ("timesheets"."break_minutes" >= 0 AND "timesheets"."break_minutes" <= 240),
	CONSTRAINT "timesheets_times_differ" CHECK ("timesheets"."clock_in" <> "timesheets"."clock_out"),
	CONSTRAINT "timesheets_reviewed_iff_not_submitted" CHECK (("timesheets"."status" = 'submitted') = ("timesheets"."reviewed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "inspection_packages" ADD CONSTRAINT "inspection_packages_network_id_hospital_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."hospital_networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_packages" ADD CONSTRAINT "inspection_packages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_packages" ADD CONSTRAINT "inspection_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_nurse_id_nurse_profiles_user_id_fk" FOREIGN KEY ("nurse_id") REFERENCES "public"."nurse_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_packages_network_idx" ON "inspection_packages" USING btree ("network_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheets_shift_nurse_uq" ON "timesheets" USING btree ("shift_id","nurse_id") WHERE "timesheets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "timesheets_nurse_idx" ON "timesheets" USING btree ("nurse_id");