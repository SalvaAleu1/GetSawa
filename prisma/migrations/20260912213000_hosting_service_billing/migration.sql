ALTER TABLE "billing_subscriptions"
  ADD COLUMN IF NOT EXISTS "service_instance_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_subscriptions_service_instance_id_key"
  ON "billing_subscriptions" ("service_instance_id")
  WHERE "service_instance_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "billing_subscriptions_service_status_idx"
  ON "billing_subscriptions" ("service_instance_id", "status", "grace_until");

ALTER TABLE "billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_service_instance_id_fkey"
  FOREIGN KEY ("service_instance_id") REFERENCES "product_service_instances"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
