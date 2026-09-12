CREATE TABLE IF NOT EXISTS "finance_events" (
  "id" TEXT PRIMARY KEY,
  "event_key" TEXT NOT NULL UNIQUE,
  "event_type" TEXT NOT NULL,
  "payment_id" TEXT,
  "order_id" TEXT,
  "refund_id" TEXT,
  "provider" TEXT NOT NULL,
  "gross_cents" INTEGER NOT NULL DEFAULT 0,
  "provider_fee_cents" INTEGER NOT NULL DEFAULT 0,
  "net_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "provider_reference" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_events_amounts_check" CHECK (
    "gross_cents" >= 0 AND "provider_fee_cents" >= 0
  ),
  CONSTRAINT "finance_events_type_check" CHECK (
    "event_type" IN ('PAYMENT_CAPTURED','PAYMENT_REFUNDED','PAYMENT_DISPUTED','PAYMENT_FEE_ADJUSTMENT')
  )
);

CREATE INDEX IF NOT EXISTS "finance_events_payment_idx" ON "finance_events" ("payment_id", "created_at");
CREATE INDEX IF NOT EXISTS "finance_events_order_idx" ON "finance_events" ("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "finance_events_type_idx" ON "finance_events" ("event_type", "created_at");

ALTER TABLE "finance_events"
  ADD CONSTRAINT "finance_events_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_events"
  ADD CONSTRAINT "finance_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_events"
  ADD CONSTRAINT "finance_events_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;
