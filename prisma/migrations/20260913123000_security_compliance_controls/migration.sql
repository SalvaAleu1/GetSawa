CREATE TABLE IF NOT EXISTS "security_rate_limit_buckets" (
  "bucket_key" TEXT NOT NULL,
  "window_start" TIMESTAMPTZ NOT NULL,
  "window_seconds" INTEGER NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("bucket_key","window_start")
);
CREATE INDEX IF NOT EXISTS "security_rate_limit_updated_idx" ON "security_rate_limit_buckets"("updated_at");

CREATE TABLE IF NOT EXISTS "security_events" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "subject_hash" TEXT,
  "resource_type" TEXT,
  "resource_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("severity" IN ('INFO','WARNING','CRITICAL'))
);
CREATE INDEX IF NOT EXISTS "security_events_created_idx" ON "security_events"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "security_events_user_idx" ON "security_events"("user_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "abuse_flags" (
  "id" TEXT PRIMARY KEY,
  "dedupe_key" TEXT NOT NULL UNIQUE,
  "user_id" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "order_id" TEXT REFERENCES "Order"("id") ON DELETE SET NULL,
  "signal" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  CHECK ("severity" IN ('INFO','WARNING','CRITICAL')),
  CHECK ("status" IN ('OPEN','ACKNOWLEDGED','RESOLVED'))
);
CREATE INDEX IF NOT EXISTS "abuse_flags_status_idx" ON "abuse_flags"("status","severity","created_at" DESC);

CREATE TABLE IF NOT EXISTS "privacy_requests" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "request_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "review_note" TEXT,
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("request_type" IN ('EXPORT','DELETION')),
  CHECK ("status" IN ('PENDING','IN_REVIEW','COMPLETED','DECLINED'))
);
CREATE INDEX IF NOT EXISTS "privacy_requests_user_idx" ON "privacy_requests"("user_id","requested_at" DESC);
CREATE INDEX IF NOT EXISTS "privacy_requests_status_idx" ON "privacy_requests"("status","requested_at");
