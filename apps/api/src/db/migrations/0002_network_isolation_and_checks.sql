-- Hand-ordered: the UNIQUE constraints must exist before the composite FKs that reference them.
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_id_network_uq" UNIQUE("id","network_id");--> statement-breakpoint
ALTER TABLE "nurse_profiles" ADD CONSTRAINT "nurse_profiles_user_network_uq" UNIQUE("user_id","network_id");--> statement-breakpoint
-- Cross-tenant guard: a shift's claiming nurse and facility must belong to the shift's network (MATCH SIMPLE: NULLs skip the check).
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_network_nurse_fk" FOREIGN KEY ("claimed_by","network_id") REFERENCES "public"."nurse_profiles"("user_id","network_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_network_facility_fk" FOREIGN KEY ("facility_id","network_id") REFERENCES "public"."facilities"("id","network_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- A completed shift keeps its nurse, so the nurse<->status rule now covers filled AND completed.
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_filled_iff_claimed";--> statement-breakpoint
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_filled_has_claimed_at";--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_claimed_iff_filled_or_completed" CHECK (("shifts"."claimed_by" IS NOT NULL) = ("shifts"."status" IN ('filled','completed')));--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_filled_has_claimed_at" CHECK ("shifts"."status" NOT IN ('filled','completed') OR "shifts"."claimed_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_name_nonblank" CHECK (length(trim("agencies"."name")) > 0);--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_name_nonblank" CHECK (length(trim("facilities"."name")) > 0);--> statement-breakpoint
ALTER TABLE "hospital_networks" ADD CONSTRAINT "hospital_networks_name_nonblank" CHECK (length(trim("hospital_networks"."name")) > 0);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_nonblank" CHECK (length(trim("users"."email")) > 0);--> statement-breakpoint
-- Keep the append-only triggers firing even under session_replication_role = replica.
ALTER TABLE "audit_log" ENABLE ALWAYS TRIGGER "audit_log_no_update_delete";--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ALWAYS TRIGGER "audit_log_no_truncate";
