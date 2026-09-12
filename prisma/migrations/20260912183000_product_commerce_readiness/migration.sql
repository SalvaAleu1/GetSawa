CREATE TABLE IF NOT EXISTS "product_commerce_meta" (
  "product_id" TEXT PRIMARY KEY,
  "wholesale_cost_cents" INTEGER,
  "wholesale_currency" TEXT NOT NULL DEFAULT 'USD',
  "cost_source" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "cost_verified_at" TIMESTAMP(3),
  "provider_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "requires_domain" BOOLEAN NOT NULL DEFAULT FALSE,
  "configuration_schema" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "provisioning_contract" TEXT,
  "renewal_contract" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_cost_check" CHECK ("wholesale_cost_cents" IS NULL OR "wholesale_cost_cents" >= 0),
  CONSTRAINT "product_cost_source_check" CHECK ("cost_source" IN ('UNKNOWN','MANUAL_VERIFIED','PROVIDER_SYNC','INTERNAL_VERIFIED'))
);

CREATE TABLE IF NOT EXISTS "product_order_configuration" (
  "order_item_id" TEXT PRIMARY KEY,
  "domain_id" TEXT,
  "configuration" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "product_service_instances" (
  "id" TEXT PRIMARY KEY,
  "order_item_id" TEXT NOT NULL UNIQUE,
  "user_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "domain_id" TEXT,
  "provider_name" TEXT NOT NULL,
  "provider_resource_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_service_status_check" CHECK ("status" IN ('ACTIVE','SUSPENDED','TERMINATED','PROVIDER_ERROR'))
);

CREATE INDEX IF NOT EXISTS "product_service_user_idx" ON "product_service_instances" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "product_service_product_idx" ON "product_service_instances" ("product_id", "status");
CREATE INDEX IF NOT EXISTS "product_service_domain_idx" ON "product_service_instances" ("domain_id");

ALTER TABLE "product_commerce_meta" ADD CONSTRAINT "product_commerce_meta_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_order_configuration" ADD CONSTRAINT "product_order_configuration_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_order_configuration" ADD CONSTRAINT "product_order_configuration_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_service_instances" ADD CONSTRAINT "product_service_instances_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_service_instances" ADD CONSTRAINT "product_service_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_service_instances" ADD CONSTRAINT "product_service_instances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_service_instances" ADD CONSTRAINT "product_service_instances_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Legacy ACTIVE generic products have never been proven against the new
-- provisioning contract. Take them out of checkout until an administrator
-- verifies cost and provider readiness under this phase.
UPDATE "Product" SET "status"='CONFIGURED' WHERE "status"='ACTIVE';
