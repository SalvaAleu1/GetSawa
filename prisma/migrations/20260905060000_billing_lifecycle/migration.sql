CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "domain_id" TEXT UNIQUE,
  "product_id" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'paypal',
  "provider_subscription_id" TEXT UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "billing_cycle" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "current_period_start" TIMESTAMP(3) NOT NULL,
  "current_period_end" TIMESTAMP(3) NOT NULL,
  "next_billing_at" TIMESTAMP(3) NOT NULL,
  "grace_until" TIMESTAMP(3),
  "auto_renew" BOOLEAN NOT NULL DEFAULT TRUE,
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT FALSE,
  "failed_payment_count" INTEGER NOT NULL DEFAULT 0,
  "last_payment_at" TIMESTAMP(3),
  "last_renewal_order_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "billing_subscriptions_user_id_idx" ON "billing_subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "billing_subscriptions_next_billing_at_idx" ON "billing_subscriptions" ("next_billing_at");
CREATE INDEX IF NOT EXISTS "billing_subscriptions_status_idx" ON "billing_subscriptions" ("status");

CREATE TABLE IF NOT EXISTS "billing_renewal_attempts" (
  "id" TEXT PRIMARY KEY,
  "subscription_id" TEXT NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "order_id" TEXT UNIQUE,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failure_code" TEXT,
  "failure_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_renewal_attempts_subscription_period_key" UNIQUE ("subscription_id", "period_end")
);

CREATE INDEX IF NOT EXISTS "billing_renewal_attempts_status_idx" ON "billing_renewal_attempts" ("status");
CREATE INDEX IF NOT EXISTS "billing_renewal_attempts_scheduled_at_idx" ON "billing_renewal_attempts" ("scheduled_at");

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_domain_id_fkey"
  FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_last_renewal_order_id_fkey"
  FOREIGN KEY ("last_renewal_order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_renewal_attempts"
  ADD CONSTRAINT "billing_renewal_attempts_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_renewal_attempts"
  ADD CONSTRAINT "billing_renewal_attempts_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
