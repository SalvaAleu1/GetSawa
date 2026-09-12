CREATE TABLE IF NOT EXISTS "premium_listing_requests" (
  "id" TEXT PRIMARY KEY,
  "domain_id" TEXT NOT NULL,
  "seller_user_id" TEXT NOT NULL,
  "asking_price_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "category" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "commission_bps" INTEGER,
  "terms_accepted_at" TIMESTAMP(3) NOT NULL,
  "decided_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "decision_note" TEXT,
  "premium_domain_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_listing_request_price_check" CHECK ("asking_price_cents" > 0),
  CONSTRAINT "premium_listing_request_status_check" CHECK ("status" IN ('SUBMITTED','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT "premium_listing_request_commission_check" CHECK ("commission_bps" IS NULL OR ("commission_bps" >= 0 AND "commission_bps" <= 10000))
);

CREATE UNIQUE INDEX IF NOT EXISTS "premium_listing_requests_active_domain_idx"
  ON "premium_listing_requests" ("domain_id")
  WHERE "status" IN ('SUBMITTED','APPROVED');
CREATE INDEX IF NOT EXISTS "premium_listing_requests_seller_idx" ON "premium_listing_requests" ("seller_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "premium_listing_requests_status_idx" ON "premium_listing_requests" ("status", "created_at");

ALTER TABLE "premium_listing_requests"
  ADD CONSTRAINT "premium_listing_requests_domain_id_fkey"
  FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "premium_listing_requests"
  ADD CONSTRAINT "premium_listing_requests_seller_user_id_fkey"
  FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "premium_listing_requests"
  ADD CONSTRAINT "premium_listing_requests_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "premium_listing_requests"
  ADD CONSTRAINT "premium_listing_requests_premium_domain_id_fkey"
  FOREIGN KEY ("premium_domain_id") REFERENCES "PremiumDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
