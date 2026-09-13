import { prisma } from "@/lib/prisma";

async function optional<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try { return await work(); } catch { return fallback; }
}

export async function getAnalyticsOverview(from: Date, to: Date) {
  const [financeRows, businessRows, growthRows, supportRows, apiRows, jobRows, errorRows, productRows, cohortRows, providers, reconciliationRows, snapshots] = await Promise.all([
    optional(() => prisma.$queryRaw<Array<{ gross: bigint; refunds: bigint; fees: bigint; net: bigint; captures: bigint; disputes: bigint }>>`
      SELECT
        COALESCE(SUM(CASE WHEN "event_type"='PAYMENT_CAPTURED' THEN "gross_cents" ELSE 0 END),0) AS gross,
        COALESCE(SUM(CASE WHEN "event_type"='PAYMENT_REFUNDED' THEN "gross_cents" ELSE 0 END),0) AS refunds,
        COALESCE(SUM("provider_fee_cents"),0) AS fees,
        COALESCE(SUM("net_cents"),0) AS net,
        COUNT(*) FILTER (WHERE "event_type"='PAYMENT_CAPTURED') AS captures,
        COUNT(*) FILTER (WHERE "event_type"='PAYMENT_DISPUTED') AS disputes
      FROM "finance_events" WHERE "created_at">=${from} AND "created_at"<${to}
    `, []),
    optional(() => prisma.$queryRaw<Array<{ new_customers: bigint; orders: bigint; active_domains: bigint; paid_invoices: bigint }>>`
      SELECT
        (SELECT COUNT(*) FROM "User" WHERE "adminRole" IS NULL AND "createdAt">=${from} AND "createdAt"<${to}) AS new_customers,
        (SELECT COUNT(*) FROM "Order" WHERE "createdAt">=${from} AND "createdAt"<${to}) AS orders,
        (SELECT COUNT(*) FROM "Domain" WHERE "status" IN ('ACTIVE','EXPIRING')) AS active_domains,
        (SELECT COUNT(*) FROM "Invoice" WHERE "status"='PAID' AND "paidAt">=${from} AND "paidAt"<${to}) AS paid_invoices
    `, []),
    optional(() => prisma.$queryRaw<Array<{ clicks: bigint; conversions: bigint; value: bigint }>>`
      SELECT COUNT(*) FILTER (WHERE "event_type"='CLICK') AS clicks,
             COUNT(*) FILTER (WHERE "event_type"='ORDER_PAID') AS conversions,
             COALESCE(SUM(CASE WHEN "event_type"='ORDER_PAID' THEN "value_cents" ELSE 0 END),0) AS value
      FROM "growth_events" WHERE "occurred_at">=${from} AND "occurred_at"<${to}
    `, []),
    optional(() => prisma.$queryRaw<Array<{ created: bigint; open: bigint; urgent_open: bigint }>>`
      SELECT
        (SELECT COUNT(*) FROM "SupportTicket" WHERE "createdAt">=${from} AND "createdAt"<${to}) AS created,
        (SELECT COUNT(*) FROM "SupportTicket" WHERE "status" IN ('OPEN','PENDING')) AS open,
        (SELECT COUNT(*) FROM "SupportTicket" WHERE "status" IN ('OPEN','PENDING') AND "priority"='URGENT') AS urgent_open
    `, []),
    optional(() => prisma.$queryRaw<Array<{ requests: bigint; errors: bigint; avg_ms: number | null; p95_ms: number | null }>>`
      SELECT COUNT(*) AS requests,
             COUNT(*) FILTER (WHERE "status_code">=400) AS errors,
             AVG("duration_ms")::float AS avg_ms,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "duration_ms")::float AS p95_ms
      FROM "developer_api_requests" WHERE "created_at">=${from} AND "created_at"<${to}
    `, []),
    optional(() => prisma.$queryRaw<Array<{ runs: bigint; failed: bigint; avg_ms: number | null }>>`
      SELECT COUNT(*) AS runs, COUNT(*) FILTER (WHERE "status"='FAILED') AS failed, AVG("duration_ms")::float AS avg_ms
      FROM "scheduled_job_runs" WHERE "scheduled_at">=${from} AND "scheduled_at"<${to}
    `, []),
    optional(() => prisma.$queryRaw<Array<{ fingerprint: string; error_name: string; message: string; count: bigint; latest: Date }>>`
      SELECT "fingerprint",MAX("error_name") AS error_name,MAX("message") AS message,COUNT(*) AS count,MAX("created_at") AS latest
      FROM "application_error_events" WHERE "created_at">=${from} AND "created_at"<${to}
      GROUP BY "fingerprint" ORDER BY COUNT(*) DESC,MAX("created_at") DESC LIMIT 20
    `, []),
    optional(() => prisma.$queryRaw<Array<{ product_id: string; sku: string; name: string; category: string; units: bigint; revenue: bigint; estimated_cost: bigint; missing_cost_units: bigint }>>`
      SELECT p."id" AS product_id,p."sku",p."name",p."category"::text AS category,
             COALESCE(SUM(oi."quantity"),0) AS units,COALESCE(SUM(oi."totalCents"),0) AS revenue,
             COALESCE(SUM(CASE WHEN pcm."wholesale_cost_cents" IS NOT NULL THEN pcm."wholesale_cost_cents"*oi."quantity" ELSE 0 END),0) AS estimated_cost,
             COALESCE(SUM(CASE WHEN pcm."wholesale_cost_cents" IS NULL THEN oi."quantity" ELSE 0 END),0) AS missing_cost_units
      FROM "OrderItem" oi JOIN "Order" o ON o."id"=oi."orderId" JOIN "Product" p ON p."id"=oi."productId"
      JOIN "Invoice" i ON i."orderId"=o."id" AND i."status"='PAID'
      LEFT JOIN "product_commerce_meta" pcm ON pcm."product_id"=p."id"
      WHERE i."paidAt">=${from} AND i."paidAt"<${to}
      GROUP BY p."id",p."sku",p."name",p."category" ORDER BY revenue DESC LIMIT 50
    `, []),
    optional(() => prisma.$queryRaw<Array<{ cohort_month: Date; customers: bigint; activated_30d: bigint }>>`
      SELECT date_trunc('month',u."createdAt") AS cohort_month,COUNT(*) AS customers,
             COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "Invoice" i WHERE i."userId"=u."id" AND i."status"='PAID' AND i."paidAt" IS NOT NULL
               AND i."paidAt">=u."createdAt" AND i."paidAt"<u."createdAt"+INTERVAL '30 days'
             )) AS activated_30d
      FROM "User" u WHERE u."adminRole" IS NULL AND u."createdAt">=${from} AND u."createdAt"<${to}
      GROUP BY date_trunc('month',u."createdAt") ORDER BY cohort_month ASC
    `, []),
    prisma.providerCredential.findMany({ orderBy: { provider: "asc" }, select: { provider: true, isConfigured: true, isEnabled: true, lastTestedAt: true, lastTestOk: true, lastTestMessage: true } }),
    optional(() => prisma.$queryRaw<Array<{ paid_without_capture_event: bigint; refunds_without_event: bigint; failed_provider_webhooks: bigint; dead_developer_webhooks: bigint; failed_messages: bigint }>>`
      SELECT
        (SELECT COUNT(*) FROM "Payment" p WHERE p."status" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') AND p."provider"<>'credit' AND NOT EXISTS (SELECT 1 FROM "finance_events" f WHERE f."payment_id"=p."id" AND f."event_type"='PAYMENT_CAPTURED')) AS paid_without_capture_event,
        (SELECT COUNT(*) FROM "Refund" r WHERE r."status"='COMPLETED' AND NOT EXISTS (SELECT 1 FROM "finance_events" f WHERE f."refund_id"=r."id" AND f."event_type"='PAYMENT_REFUNDED')) AS refunds_without_event,
        (SELECT COUNT(*) FROM "WebhookEvent" WHERE "processingStatus"='FAILED') AS failed_provider_webhooks,
        (SELECT COUNT(*) FROM "developer_webhook_deliveries" WHERE "status"='DEAD') AS dead_developer_webhooks,
        (SELECT COUNT(*) FROM "message_deliveries" WHERE "status"='FAILED') AS failed_messages
    `, []),
    optional(() => prisma.$queryRaw<Array<{ snapshot_date: Date; metrics: unknown }>>`
      SELECT "snapshot_date","metrics" FROM "analytics_daily_snapshots" WHERE "snapshot_date">=${from}::date AND "snapshot_date"<${to}::date ORDER BY "snapshot_date" ASC
    `, []),
  ]);

  const finance = financeRows[0]; const business = businessRows[0]; const growth = growthRows[0]; const support = supportRows[0]; const api = apiRows[0]; const jobs = jobRows[0]; const reconciliation = reconciliationRows[0];
  return {
    from, to,
    finance: { grossCents:Number(finance?.gross??0), refundedCents:Number(finance?.refunds??0), providerFeesCents:Number(finance?.fees??0), netCents:Number(finance?.net??0), captures:Number(finance?.captures??0), disputes:Number(finance?.disputes??0) },
    business: { newCustomers:Number(business?.new_customers??0), orders:Number(business?.orders??0), activeDomains:Number(business?.active_domains??0), paidInvoices:Number(business?.paid_invoices??0) },
    growth: { clicks:Number(growth?.clicks??0), conversions:Number(growth?.conversions??0), conversionValueCents:Number(growth?.value??0), conversionRate:Number(growth?.clicks??0)>0?Number(growth?.conversions??0)/Number(growth?.clicks??1):0 },
    support: { created:Number(support?.created??0), open:Number(support?.open??0), urgentOpen:Number(support?.urgent_open??0) },
    api: { requests:Number(api?.requests??0), errors:Number(api?.errors??0), averageMs:Number(api?.avg_ms??0), p95Ms:Number(api?.p95_ms??0) },
    jobs: { runs:Number(jobs?.runs??0), failed:Number(jobs?.failed??0), averageMs:Number(jobs?.avg_ms??0) },
    errors: errorRows.map(r=>({fingerprint:r.fingerprint,errorName:r.error_name,message:r.message,count:Number(r.count),latest:r.latest})),
    products: productRows.map(r=>({productId:r.product_id,sku:r.sku,name:r.name,category:r.category,units:Number(r.units),revenueCents:Number(r.revenue),estimatedCostCents:Number(r.estimated_cost),estimatedMarginCents:Number(r.revenue)-Number(r.estimated_cost),missingCostUnits:Number(r.missing_cost_units)})),
    cohorts: cohortRows.map(r=>({month:r.cohort_month,customers:Number(r.customers),activated30d:Number(r.activated_30d),activationRate:Number(r.customers)>0?Number(r.activated_30d)/Number(r.customers):0})),
    providers,
    reconciliation: { paidWithoutCaptureEvent:Number(reconciliation?.paid_without_capture_event??0), refundsWithoutEvent:Number(reconciliation?.refunds_without_event??0), failedProviderWebhooks:Number(reconciliation?.failed_provider_webhooks??0), deadDeveloperWebhooks:Number(reconciliation?.dead_developer_webhooks??0), failedMessages:Number(reconciliation?.failed_messages??0) },
    snapshots: snapshots.map(row=>({date:row.snapshot_date,metrics:row.metrics})),
  };
}

export async function captureDailyAnalyticsSnapshot(snapshotDate = new Date(Date.now()-86400000)) {
  const start = new Date(Date.UTC(snapshotDate.getUTCFullYear(),snapshotDate.getUTCMonth(),snapshotDate.getUTCDate()));
  const end = new Date(start.getTime()+86400000);
  const overview = await getAnalyticsOverview(start,end);
  const metrics = { finance:overview.finance,business:overview.business,growth:overview.growth,support:overview.support,api:overview.api,jobs:overview.jobs,reconciliation:overview.reconciliation };
  await prisma.$executeRaw`
    INSERT INTO "analytics_daily_snapshots" ("snapshot_date","metrics") VALUES (${start}::date,${JSON.stringify(metrics)}::jsonb)
    ON CONFLICT ("snapshot_date") DO UPDATE SET "metrics"=EXCLUDED."metrics","updated_at"=CURRENT_TIMESTAMP
  `;
  return { snapshotDate:start, metrics };
}

export async function financeExportRows(from: Date,to: Date) {
  return prisma.$queryRaw<Array<{ created_at:Date;event_type:string;provider:string;gross_cents:number;provider_fee_cents:number;net_cents:number;currency:string;order_id:string|null;payment_id:string|null;refund_id:string|null;provider_reference:string|null }>>`
    SELECT "created_at","event_type","provider","gross_cents","provider_fee_cents","net_cents","currency","order_id","payment_id","refund_id","provider_reference"
    FROM "finance_events" WHERE "created_at">=${from} AND "created_at"<${to} ORDER BY "created_at" ASC
  `;
}
