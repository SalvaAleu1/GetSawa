-- Phase 19: immutable deployments, Worker custom domains and redirects.

CREATE TABLE IF NOT EXISTS "website_deployments" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
  "status" TEXT NOT NULL DEFAULT 'LIVE',
  "public_path" TEXT NOT NULL,
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "website_deployment_environment_check" CHECK ("environment" IN ('PREVIEW','PRODUCTION')),
  CONSTRAINT "website_deployment_status_check" CHECK ("status" IN ('LIVE','ROLLED_BACK','RETIRED','FAILED')),
  CONSTRAINT "website_deployments_project_fkey" FOREIGN KEY ("project_id") REFERENCES "WebsiteProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "website_deployments_version_fkey" FOREIGN KEY ("version_id") REFERENCES "WebsiteVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "website_deployments_project_created_idx" ON "website_deployments" ("project_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "website_deployments_project_status_idx" ON "website_deployments" ("project_id", "environment", "status");

CREATE TABLE IF NOT EXISTS "website_custom_domains" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "domain_id" TEXT NOT NULL,
  "hostname" TEXT NOT NULL UNIQUE,
  "zone_id" TEXT NOT NULL,
  "cloudflare_domain_id" TEXT UNIQUE,
  "certificate_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "is_primary" BOOLEAN NOT NULL DEFAULT FALSE,
  "last_error" TEXT,
  "last_checked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "website_custom_domain_status_check" CHECK ("status" IN ('PENDING','ACTIVE','FAILED','DETACHED')),
  CONSTRAINT "website_custom_domains_project_fkey" FOREIGN KEY ("project_id") REFERENCES "WebsiteProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "website_custom_domains_domain_fkey" FOREIGN KEY ("domain_id") REFERENCES "Domain"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "website_custom_domains_project_idx" ON "website_custom_domains" ("project_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "website_custom_domains_one_primary" ON "website_custom_domains" ("project_id") WHERE "is_primary"=TRUE AND "status" <> 'DETACHED';

CREATE TABLE IF NOT EXISTS "website_redirects" (
  "id" TEXT PRIMARY KEY,
  "project_id" TEXT NOT NULL,
  "source_path" TEXT NOT NULL,
  "target_path" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL DEFAULT 301,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "website_redirect_status_code_check" CHECK ("status_code" IN (301,302,307,308)),
  CONSTRAINT "website_redirects_project_fkey" FOREIGN KEY ("project_id") REFERENCES "WebsiteProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "website_redirects_unique_source" UNIQUE ("project_id", "source_path")
);
