-- Phase 21: campaign attribution and idempotent affiliate conversion records.
CREATE TABLE IF NOT EXISTS "growth_campaigns" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "channel" TEXT NOT NULL DEFAULT 'LINK',
  "destination_path" TEXT NOT NULL,
  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_campaign_status_check" CHECK ("status" IN ('DRAFT','SCHEDULED','ACTIVE','PAUSED','ENDED')),
  CONSTRAINT "growth_campaign_channel_check" CHECK ("channel" IN ('LINK','EMAIL','SOCIAL','PARTNER','INTERNAL')),
  CONSTRAINT "growth_campaign_creator_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "growth_events" (
  "id" TEXT PRIMARY KEY,
  "event_key" TEXT NOT NULL UNIQUE,
  "campaign_id" TEXT,
  "affiliate_id" TEXT,
  "user_id" TEXT,
  "order_id" TEXT,
  "event_type" TEXT NOT NULL,
  "value_cents" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "growth_event_type_check" CHECK ("event_type" IN ('CLICK','SIGNUP','ORDER_PAID')),
  CONSTRAINT "growth_event_campaign_fkey" FOREIGN KEY ("campaign_id") REFERENCES "growth_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "growth_event_affiliate_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "Affiliate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "growth_event_user_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "growth_event_order_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "growth_events_campaign_time_idx" ON "growth_events" ("campaign_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "growth_events_type_time_idx" ON "growth_events" ("event_type", "occurred_at");

CREATE UNIQUE INDEX IF NOT EXISTS "Commission_affiliate_order_unique"
  ON "Commission" ("affiliateId", "orderId") WHERE "orderId" IS NOT NULL;
