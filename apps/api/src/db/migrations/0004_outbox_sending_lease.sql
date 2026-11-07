ALTER TYPE "public"."notification_status" ADD VALUE 'sending' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "locked_until" timestamp with time zone;