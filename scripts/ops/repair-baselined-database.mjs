import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;

const HISTORICAL_MIGRATIONS = [
  "20260905060000_billing_lifecycle",
  "20260912153000_premium_aftermarket",
  "20260912154500_premium_seller_requests",
  "20260912170000_auction_verified_inventory",
  "20260912183000_product_commerce_readiness",
  "20260912194500_finance_integrity",
  "20260912203000_credit_checkout_recovery",
  "20260912204500_payment_failure_events",
  "20260912213000_hosting_service_billing",
  "20260913003000_business_email_foundation",
  "20260913030000_cloudflare_security_foundation",
  "20260913050000_website_editor_versions",
  "20260913063000_website_publishing_runtime",
  "20260913080000_growth_campaign_attribution",
  "20260913093000_messaging_delivery_support_ops",
  "20260913110000_developer_api_platform",
  "20260913123000_security_compliance_controls",
  "20260913124000_analytics_observability",
];

const EXPECTED_OPERATIONAL_TABLES = [
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

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL or DIRECT_URL is required for baseline repair.");
  process.exit(1);
}

const client = new Client({ connectionString });

async function presentOperationalTables() {
  const result = await client.query(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[]) ORDER BY tablename`,
    [EXPECTED_OPERATIONAL_TABLES],
  );
  return result.rows.map((row) => String(row.tablename));
}

async function main() {
  await client.connect();
  const present = await presentOperationalTables();

  if (present.length === EXPECTED_OPERATIONAL_TABLES.length) {
    console.log(`Operational schema is complete (${present.length}/${EXPECTED_OPERATIONAL_TABLES.length} expected tables present).`);
    return;
  }

  if (present.length > 0) {
    const presentSet = new Set(present);
    const missing = EXPECTED_OPERATIONAL_TABLES.filter((name) => !presentSet.has(name));
    throw new Error(
      `Operational schema is partially present; refusing automatic repair. Present: ${present.join(", ")}. Missing: ${missing.join(", ")}.`,
    );
  }

  console.log("Historical migrations were baselined but their operational tables are absent. Replaying the 18 retained SQL migrations in one transaction...");
  await client.query("BEGIN");
  try {
    for (const migration of HISTORICAL_MIGRATIONS) {
      const file = join(process.cwd(), "prisma", "migrations", migration, "migration.sql");
      const sql = await readFile(file, "utf8");
      console.log(`Applying operational SQL from ${migration}...`);
      await client.query(sql);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const repaired = await presentOperationalTables();
  if (repaired.length !== EXPECTED_OPERATIONAL_TABLES.length) {
    const repairedSet = new Set(repaired);
    const missing = EXPECTED_OPERATIONAL_TABLES.filter((name) => !repairedSet.has(name));
    throw new Error(`Operational schema repair did not create all expected tables. Missing: ${missing.join(", ")}.`);
  }

  console.log(`Operational schema repaired successfully (${repaired.length}/${EXPECTED_OPERATIONAL_TABLES.length} expected tables present).`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end().catch(() => undefined);
  });
