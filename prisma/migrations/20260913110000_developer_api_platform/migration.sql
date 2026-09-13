CREATE TABLE IF NOT EXISTS "developer_api_requests" (
  "id" TEXT PRIMARY KEY,
  "api_client_id" TEXT NOT NULL REFERENCES "ApiClient"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "request_id" TEXT NOT NULL UNIQUE,
  "method" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "developer_api_requests_client_created_idx" ON "developer_api_requests"("api_client_id","created_at" DESC);
CREATE INDEX IF NOT EXISTS "developer_api_requests_user_created_idx" ON "developer_api_requests"("user_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "developer_webhook_subscriptions" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "secret_encrypted" TEXT NOT NULL,
  "events" TEXT[] NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "developer_webhooks_user_idx" ON "developer_webhook_subscriptions"("user_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "developer_events" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "event_type" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "developer_events_user_created_idx" ON "developer_events"("user_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "developer_webhook_deliveries" (
  "id" TEXT PRIMARY KEY,
  "event_id" TEXT NOT NULL REFERENCES "developer_events"("id") ON DELETE CASCADE,
  "subscription_id" TEXT NOT NULL REFERENCES "developer_webhook_subscriptions"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_status_code" INTEGER,
  "last_error" TEXT,
  "delivered_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("event_id","subscription_id"),
  CHECK ("status" IN ('QUEUED','FAILED','DELIVERED','DEAD'))
);
CREATE INDEX IF NOT EXISTS "developer_webhook_delivery_retry_idx" ON "developer_webhook_deliveries"("status","next_attempt_at");

CREATE TABLE IF NOT EXISTS "developer_idempotency" (
  "id" TEXT PRIMARY KEY,
  "api_client_id" TEXT NOT NULL REFERENCES "ApiClient"("id") ON DELETE CASCADE,
  "operation" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "response_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ NOT NULL,
  UNIQUE("api_client_id","operation","idempotency_key")
);
CREATE INDEX IF NOT EXISTS "developer_idempotency_expiry_idx" ON "developer_idempotency"("expires_at");
