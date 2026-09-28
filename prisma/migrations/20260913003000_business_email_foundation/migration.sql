-- Phase 16: business email domain state and service lifecycle hardening.

-- Phase 15 introduced a recoverable SUSPENSION_PENDING state for provider
-- outages during refund/non-payment enforcement. The original Phase 13 check
-- constraint predates that state, so widen it before any such transition can
-- reach production.
ALTER TABLE "product_service_instances"
  DROP CONSTRAINT IF EXISTS "product_service_status_check";

ALTER TABLE "product_service_instances"
  ADD CONSTRAINT "product_service_status_check"
  CHECK ("status" IN ('ACTIVE','SUSPENDED','SUSPENSION_PENDING','TERMINATED','PROVIDER_ERROR'));

-- A provider resource may only belong to one GetSawa service. This prevents a
-- retry or duplicate checkout from selling the same external mailbox/account
-- twice while still allowing identical identifiers at different providers.
CREATE UNIQUE INDEX IF NOT EXISTS "product_service_provider_resource_key"
  ON "product_service_instances" ("provider_name", "provider_resource_id");

CREATE TABLE IF NOT EXISTS "email_domain_services" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "domain_id" TEXT NOT NULL,
  "provider_name" TEXT NOT NULL,
  "provider_domain" TEXT NOT NULL,
  "cluster" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROVISIONED',
  "dns_status" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "last_dns_checked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_domain_cluster_check" CHECK ("cluster" IN ('A','B')),
  CONSTRAINT "email_domain_status_check" CHECK ("status" IN ('PROVISIONED','DNS_PENDING','ACTIVE','SUSPENDED','PROVIDER_ERROR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_domain_services_domain_provider_key"
  ON "email_domain_services" ("domain_id", "provider_name");

CREATE INDEX IF NOT EXISTS "email_domain_services_user_status_idx"
  ON "email_domain_services" ("user_id", "status");

ALTER TABLE "email_domain_services"
  ADD CONSTRAINT "email_domain_services_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_domain_services"
  ADD CONSTRAINT "email_domain_services_domain_id_fkey"
  FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
