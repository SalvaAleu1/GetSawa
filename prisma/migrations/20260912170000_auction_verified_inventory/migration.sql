CREATE TABLE IF NOT EXISTS "auction_inventory" (
  "auction_id" TEXT PRIMARY KEY,
  "premium_domain_id" TEXT NOT NULL UNIQUE,
  "source" TEXT NOT NULL,
  "seller_user_id" TEXT,
  "commission_bps" INTEGER NOT NULL DEFAULT 0,
  "acquisition_cost_cents" INTEGER,
  "outcome" TEXT,
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auction_inventory_source_check" CHECK ("source" IN ('GETSAWA_INVENTORY','CUSTOMER_CUSTODY')),
  CONSTRAINT "auction_inventory_commission_check" CHECK ("commission_bps" >= 0 AND "commission_bps" <= 10000),
  CONSTRAINT "auction_inventory_cost_check" CHECK ("acquisition_cost_cents" IS NULL OR "acquisition_cost_cents" >= 0)
);

CREATE TABLE IF NOT EXISTS "auction_orders" (
  "auction_id" TEXT PRIMARY KEY,
  "order_id" TEXT UNIQUE,
  "order_item_id" TEXT UNIQUE,
  "winner_user_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'PAYMENT_PENDING',
  "provider_order_id" TEXT,
  "provider_capture_id" TEXT,
  "payment_deadline" TIMESTAMP(3),
  "registrar_reference" TEXT,
  "fulfilled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auction_order_amount_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "auction_order_status_check" CHECK ("status" IN ('PAYMENT_PENDING','PAID','FULFILLMENT_PENDING','COMPLETED','PAYMENT_EXPIRED','FAILED'))
);

CREATE INDEX IF NOT EXISTS "auction_orders_winner_idx" ON "auction_orders" ("winner_user_id", "status");
CREATE INDEX IF NOT EXISTS "auction_orders_deadline_idx" ON "auction_orders" ("payment_deadline", "status");

ALTER TABLE "auction_inventory"
  ADD CONSTRAINT "auction_inventory_auction_id_fkey"
  FOREIGN KEY ("auction_id") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auction_inventory"
  ADD CONSTRAINT "auction_inventory_premium_domain_id_fkey"
  FOREIGN KEY ("premium_domain_id") REFERENCES "PremiumDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "auction_inventory"
  ADD CONSTRAINT "auction_inventory_seller_user_id_fkey"
  FOREIGN KEY ("seller_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auction_orders"
  ADD CONSTRAINT "auction_orders_auction_id_fkey"
  FOREIGN KEY ("auction_id") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auction_orders"
  ADD CONSTRAINT "auction_orders_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auction_orders"
  ADD CONSTRAINT "auction_orders_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auction_orders"
  ADD CONSTRAINT "auction_orders_winner_user_id_fkey"
  FOREIGN KEY ("winner_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
