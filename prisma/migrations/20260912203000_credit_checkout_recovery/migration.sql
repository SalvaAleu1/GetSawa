CREATE TABLE IF NOT EXISTS "order_credit_applications" (
  "id" TEXT PRIMARY KEY,
  "order_id" TEXT NOT NULL UNIQUE,
  "user_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "credit_adjustment_id" TEXT,
  "refund_credit_id" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_credit_amount_check" CHECK ("amount_cents" > 0),
  CONSTRAINT "order_credit_status_check" CHECK ("status" IN ('RESERVED','APPLIED','RELEASED','REFUNDED'))
);

CREATE INDEX IF NOT EXISTS "order_credit_user_status_idx" ON "order_credit_applications" ("user_id", "status", "expires_at");

ALTER TABLE "order_credit_applications"
  ADD CONSTRAINT "order_credit_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_credit_applications"
  ADD CONSTRAINT "order_credit_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_credit_applications"
  ADD CONSTRAINT "order_credit_adjustment_id_fkey"
  FOREIGN KEY ("credit_adjustment_id") REFERENCES "CustomerCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_credit_applications"
  ADD CONSTRAINT "order_credit_refund_id_fkey"
  FOREIGN KEY ("refund_credit_id") REFERENCES "CustomerCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
