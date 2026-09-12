CREATE TABLE IF NOT EXISTS "premium_inventory_meta" (
  "premium_domain_id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "domain_id" TEXT UNIQUE,
  "seller_user_id" TEXT,
  "acquisition_cost_cents" INTEGER,
  "fulfillment_mode" TEXT NOT NULL DEFAULT 'MANUAL_REVIEW',
  "auto_buy_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "ownership_verified_at" TIMESTAMP(3),
  "verified_by_user_id" TEXT,
  "commission_bps" INTEGER NOT NULL DEFAULT 0,
  "reserved_by_user_id" TEXT,
  "reserved_until" TIMESTAMP(3),
  "sold_to_user_id" TEXT,
  "sold_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_inventory_source_check" CHECK ("source" IN ('UNVERIFIED','GETSAWA_INVENTORY','CUSTOMER_CUSTODY','REGISTRY_PREMIUM')),
  CONSTRAINT "premium_inventory_fulfillment_check" CHECK ("fulfillment_mode" IN ('MANUAL_REVIEW','INTERNAL_ASSIGNMENT','REGISTRY_REGISTRATION')),
  CONSTRAINT "premium_inventory_cost_check" CHECK ("acquisition_cost_cents" IS NULL OR "acquisition_cost_cents" >= 0),
  CONSTRAINT "premium_inventory_commission_check" CHECK ("commission_bps" >= 0 AND "commission_bps" <= 10000)
);

CREATE INDEX IF NOT EXISTS "premium_inventory_source_idx" ON "premium_inventory_meta" ("source");
CREATE INDEX IF NOT EXISTS "premium_inventory_reservation_idx" ON "premium_inventory_meta" ("reserved_until");
CREATE INDEX IF NOT EXISTS "premium_inventory_seller_idx" ON "premium_inventory_meta" ("seller_user_id");

CREATE TABLE IF NOT EXISTS "premium_offers" (
  "id" TEXT PRIMARY KEY,
  "premium_domain_id" TEXT NOT NULL,
  "buyer_user_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "counter_amount_cents" INTEGER,
  "accepted_price_cents" INTEGER,
  "expires_at" TIMESTAMP(3),
  "decided_by_user_id" TEXT,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_offer_amount_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "premium_offer_status_check" CHECK ("status" IN ('PENDING','COUNTERED','ACCEPTED','REJECTED','WITHDRAWN','EXPIRED','PURCHASED'))
);

CREATE INDEX IF NOT EXISTS "premium_offers_listing_idx" ON "premium_offers" ("premium_domain_id", "created_at");
CREATE INDEX IF NOT EXISTS "premium_offers_buyer_idx" ON "premium_offers" ("buyer_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "premium_offers_status_idx" ON "premium_offers" ("status");

CREATE TABLE IF NOT EXISTS "premium_order_links" (
  "order_item_id" TEXT PRIMARY KEY,
  "premium_domain_id" TEXT NOT NULL,
  "premium_offer_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "premium_order_links_listing_idx" ON "premium_order_links" ("premium_domain_id");

CREATE TABLE IF NOT EXISTS "premium_sales" (
  "id" TEXT PRIMARY KEY,
  "premium_domain_id" TEXT NOT NULL,
  "order_item_id" TEXT NOT NULL UNIQUE,
  "buyer_user_id" TEXT NOT NULL,
  "seller_user_id" TEXT,
  "gross_cents" INTEGER NOT NULL,
  "acquisition_cost_cents" INTEGER,
  "seller_proceeds_cents" INTEGER NOT NULL DEFAULT 0,
  "platform_revenue_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "settlement_status" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  "fulfilled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "premium_sales_amount_check" CHECK ("gross_cents" >= 0 AND "seller_proceeds_cents" >= 0),
  CONSTRAINT "premium_sales_settlement_check" CHECK ("settlement_status" IN ('NOT_APPLICABLE','PENDING','HELD','PAID'))
);

CREATE INDEX IF NOT EXISTS "premium_sales_listing_idx" ON "premium_sales" ("premium_domain_id");
CREATE INDEX IF NOT EXISTS "premium_sales_buyer_idx" ON "premium_sales" ("buyer_user_id");
CREATE INDEX IF NOT EXISTS "premium_sales_seller_idx" ON "premium_sales" ("seller_user_id");

ALTER TABLE "premium_inventory_meta"
  ADD CONSTRAINT "premium_inventory_meta_premium_domain_id_fkey"
  FOREIGN KEY ("premium_domain_id") REFERENCES "PremiumDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "premium_inventory_meta"
  ADD CONSTRAINT "premium_inventory_meta_domain_id_fkey"
  FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "premium_inventory_meta"
  ADD CONSTRAINT "premium_inventory_meta_seller_user_id_fkey"
  FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "premium_inventory_meta"
  ADD CONSTRAINT "premium_inventory_meta_verified_by_user_id_fkey"
  FOREIGN KEY ("verified_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "premium_inventory_meta"
  ADD CONSTRAINT "premium_inventory_meta_reserved_by_user_id_fkey"
  FOREIGN KEY ("reserved_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "premium_inventory_meta"
  ADD CONSTRAINT "premium_inventory_meta_sold_to_user_id_fkey"
  FOREIGN KEY ("sold_to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "premium_offers"
  ADD CONSTRAINT "premium_offers_premium_domain_id_fkey"
  FOREIGN KEY ("premium_domain_id") REFERENCES "PremiumDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "premium_offers"
  ADD CONSTRAINT "premium_offers_buyer_user_id_fkey"
  FOREIGN KEY ("buyer_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "premium_offers"
  ADD CONSTRAINT "premium_offers_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "premium_order_links"
  ADD CONSTRAINT "premium_order_links_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "premium_order_links"
  ADD CONSTRAINT "premium_order_links_premium_domain_id_fkey"
  FOREIGN KEY ("premium_domain_id") REFERENCES "PremiumDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "premium_order_links"
  ADD CONSTRAINT "premium_order_links_premium_offer_id_fkey"
  FOREIGN KEY ("premium_offer_id") REFERENCES "premium_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "premium_sales"
  ADD CONSTRAINT "premium_sales_premium_domain_id_fkey"
  FOREIGN KEY ("premium_domain_id") REFERENCES "PremiumDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "premium_sales"
  ADD CONSTRAINT "premium_sales_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "premium_sales"
  ADD CONSTRAINT "premium_sales_buyer_user_id_fkey"
  FOREIGN KEY ("buyer_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "premium_sales"
  ADD CONSTRAINT "premium_sales_seller_user_id_fkey"
  FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy premium rows did not prove registrar custody or distinguish cost from retail.
-- Take them offline until an administrator verifies the underlying domain and fulfillment path.
UPDATE "PremiumDomain" SET "status" = 'DELISTED' WHERE "status" = 'LISTED';
INSERT INTO "premium_inventory_meta" ("premium_domain_id", "source", "fulfillment_mode", "auto_buy_enabled")
SELECT "id", 'UNVERIFIED', 'MANUAL_REVIEW', FALSE FROM "PremiumDomain"
ON CONFLICT ("premium_domain_id") DO NOTHING;
