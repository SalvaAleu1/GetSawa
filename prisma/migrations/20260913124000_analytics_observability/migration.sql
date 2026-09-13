-- Phase 25: analytics, observability and finance reporting.
CREATE TABLE IF NOT EXISTS "scheduled_job_runs" (
  "id" TEXT PRIMARY KEY,
  "cron" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3) NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "http_status" INTEGER,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_job_runs_status_check" CHECK ("status" IN ('SUCCEEDED','FAILED'))
);
CREATE INDEX IF NOT EXISTS "scheduled_job_runs_route_time_idx" ON "scheduled_job_runs" ("route","scheduled_at" DESC);
CREATE INDEX IF NOT EXISTS "scheduled_job_runs_status_time_idx" ON "scheduled_job_runs" ("status","scheduled_at" DESC);

CREATE TABLE IF NOT EXISTS "application_error_events" (
  "id" TEXT PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "error_name" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "route" TEXT,
  "request_id" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "application_error_events_fingerprint_time_idx" ON "application_error_events" ("fingerprint","created_at" DESC);
CREATE INDEX IF NOT EXISTS "application_error_events_time_idx" ON "application_error_events" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "analytics_daily_snapshots" (
  "snapshot_date" DATE PRIMARY KEY,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
