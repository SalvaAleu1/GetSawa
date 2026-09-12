-- Phase 17: Cloudflare-backed DNS/CDN/security service state.

CREATE TABLE IF NOT EXISTS "cloudflare_zone_services" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "domain_id" TEXT NOT NULL,
  "service_instance_id" TEXT NOT NULL,
  "zone_id" TEXT NOT NULL,
  "zone_name" TEXT NOT NULL,
  "zone_status" TEXT NOT NULL DEFAULT 'pending',
  "assigned_nameservers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "dns_migration_status" TEXT NOT NULL DEFAULT 'PENDING',
  "dns_imported_count" INTEGER NOT NULL DEFAULT 0,
  "dns_unsupported" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "cutover_status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "security_profile" TEXT NOT NULL DEFAULT 'BASELINE',
  "proxy_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "https_enforced" BOOLEAN NOT NULL DEFAULT FALSE,
  "dnssec_status" TEXT NOT NULL DEFAULT 'disabled',
  "last_reconciled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cloudflare_zone_dns_migration_status_check" CHECK ("dns_migration_status" IN ('PENDING','IMPORTED','BLOCKED','FAILED')),
  CONSTRAINT "cloudflare_zone_cutover_status_check" CHECK ("cutover_status" IN ('NOT_STARTED','NAMESERVERS_UPDATED','ACTIVE','FAILED')),
  CONSTRAINT "cloudflare_zone_security_profile_check" CHECK ("security_profile" IN ('BASELINE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cloudflare_zone_services_domain_key"
  ON "cloudflare_zone_services" ("domain_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cloudflare_zone_services_instance_key"
  ON "cloudflare_zone_services" ("service_instance_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cloudflare_zone_services_zone_key"
  ON "cloudflare_zone_services" ("zone_id");
CREATE INDEX IF NOT EXISTS "cloudflare_zone_services_user_status_idx"
  ON "cloudflare_zone_services" ("user_id", "zone_status");

ALTER TABLE "cloudflare_zone_services"
  ADD CONSTRAINT "cloudflare_zone_services_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cloudflare_zone_services"
  ADD CONSTRAINT "cloudflare_zone_services_domain_id_fkey"
  FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cloudflare_zone_services"
  ADD CONSTRAINT "cloudflare_zone_services_instance_id_fkey"
  FOREIGN KEY ("service_instance_id") REFERENCES "product_service_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
