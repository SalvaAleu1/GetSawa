import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const root = process.cwd();
const migrationsDir = path.join(root, "prisma", "migrations");
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required for migration parity verification.");
  process.exit(1);
}

const committed = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
  .map((entry) => entry.name)
  .sort();

const expectedBaselineTlds = ["africa", "app", "co", "com", "dev", "io", "net", "org"];

const expectedOperationalTables = [
  "billing_subscriptions",
  "billing_renewal_attempts",
  "premium_inventory_meta",
  "premium_offers",
  "premium_order_links",
  "premium_sales",
  "premium_listing_requests",
  "auction_inventory",
  "auction_orders",
  "product_commerce_meta",
  "product_order_configuration",
  "product_service_instances",
  "finance_events",
  "order_credit_applications",
  "email_domain_services",
  "cloudflare_zone_services",
  "website_editor_state",
  "website_deployments",
  "website_custom_domains",
  "website_redirects",
  "growth_campaigns",
  "growth_events",
  "message_deliveries",
  "support_ticket_ops",
  "operational_alerts",
  "developer_api_requests",
  "developer_webhook_subscriptions",
  "developer_events",
  "developer_webhook_deliveries",
  "developer_idempotency",
  "security_rate_limit_buckets",
  "security_events",
  "abuse_flags",
  "privacy_requests",
  "scheduled_job_runs",
  "application_error_events",
  "analytics_daily_snapshots",
];

const sql = neon(connectionString);

try {
  // Neon's HTTP query path works from Cloudflare build infrastructure and does
  // not require a direct TCP connection to PostgreSQL port 5432.
  const readiness = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const tableCount = Number(readiness?.[0]?.count ?? 0);
  if (tableCount === 0) {
    throw new Error("Production database is empty. Initialize it from an explicitly approved migration environment before deploying CloudSawa.");
  }

  const failedRows = await sql`
    SELECT "migration_name"
    FROM "_prisma_migrations"
    WHERE "rolled_back_at" IS NULL AND "finished_at" IS NULL
    ORDER BY "migration_name"
  `;
  if (failedRows.length) {
    throw new Error(`Incomplete Prisma migrations detected: ${failedRows.map((row) => row.migration_name).join(", ")}`);
  }

  const appliedRows = await sql`
    SELECT "migration_name"
    FROM "_prisma_migrations"
    WHERE "rolled_back_at" IS NULL AND "finished_at" IS NOT NULL
    ORDER BY "migration_name"
  `;
  const applied = appliedRows.map((row) => String(row.migration_name)).sort();

  const missing = committed.filter((name) => !applied.includes(name));
  const unexpected = applied.filter((name) => !committed.includes(name));

  if (missing.length || unexpected.length) {
    const details = [];
    if (missing.length) details.push(`unapplied committed migrations: ${missing.join(", ")}`);
    if (unexpected.length) details.push(`applied migrations absent from this checkout: ${unexpected.join(", ")}`);
    throw new Error(`Database migration parity check failed — ${details.join("; ")}.`);
  }

  const operationalRows = await sql`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  const presentTables = new Set(operationalRows.map((row) => String(row.tablename)));
  const missingOperational = expectedOperationalTables.filter((name) => !presentTables.has(name));
  if (missingOperational.length) {
    throw new Error(`Operational schema is incomplete. Missing tables: ${missingOperational.join(", ")}.`);
  }

  const tldRows = await sql`SELECT "extension" FROM "Tld" ORDER BY "extension"`;
  const configuredTlds = new Set(tldRows.map((row) => String(row.extension).toLowerCase()));
  const missingBaselineTlds = expectedBaselineTlds.filter((extension) => !configuredTlds.has(extension));
  if (missingBaselineTlds.length) {
    throw new Error(`Safe baseline TLD configuration is incomplete. Missing: ${missingBaselineTlds.map((value) => `.${value}`).join(", ")}.`);
  }

  console.log(
    `Database readiness verified over Neon HTTPS: ${committed.length} migrations applied, ${expectedOperationalTables.length} operational tables present, baseline TLD configuration present.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
