import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber, generateOrderNumber } from "@/lib/pricing";
import { getProductCommerceMeta } from "@/lib/product-readiness";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";
import { getHostingOperationalState } from "@/lib/hosting-readiness";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { logAudit } from "@/lib/audit";
import { notifyOrderLifecycle } from "@/lib/order-notifications";

export interface HostingSubscriptionRef {
  id: string;
  userId: string;
  serviceInstanceId: string;
  currentPeriodEnd: Date;
  billingCycle: string;
}

interface HostingServiceRow {
  id: string;
  user_id: string;
  product_id: string;
  domain_id: string | null;
  provider_name: string;
  provider_resource_id: string;
  status: string;
  billing_cycle: string;
  renewal_price_cents: number | null;
  currency: string;
  product_name: string;
  customer_email: string;
  first_name: string;
  last_name: string;
  country: string | null;
  domain_name: string | null;
}

function addCycle(start: Date, cycle: string) {
  const next = new Date(start);
  if (cycle === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + 1);
  else if (cycle === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else throw new Error("Unsupported hosting billing cycle.");
  return next;
}

function nextBillingAt(periodEnd: Date, cycle: string) {
  const leadDays = cycle === "MONTHLY" ? 3 : 7;
  return new Date(periodEnd.getTime() - leadDays * 86400000);
}

async function getHostingService(serviceInstanceId: string): Promise<HostingServiceRow> {
  const rows = await prisma.$queryRaw<HostingServiceRow[]>`
    SELECT psi."id",psi."user_id",psi."product_id",psi."domain_id",psi."provider_name",psi."provider_resource_id",psi."status",
           p."billingCycle" AS "billing_cycle",p."renewalPriceCents" AS "renewal_price_cents",p."currency",p."name" AS "product_name",
           u."email" AS "customer_email",u."firstName" AS "first_name",u."lastName" AS "last_name",u."country",
           d."name" AS "domain_name"
    FROM "product_service_instances" psi
    JOIN "Product" p ON p."id"=psi."product_id"
    JOIN "User" u ON u."id"=psi."user_id"
    LEFT JOIN "Domain" d ON d."id"=psi."domain_id"
    WHERE psi."id"=${serviceInstanceId} LIMIT 1
  `;
  const service = rows[0];
  if (!service) throw new Error("Hosting service instance was not found.");
  if (service.provider_name !== "cpanel_whm") throw new Error("This service is not backed by the WHM hosting provider.");
  if (service.status === "TERMINATED") throw new Error("A terminated hosting service cannot be renewed.");
  return service;
}

export async function getProtectedHostingRenewalQuote(serviceInstanceId: string) {
  const service = await getHostingService(serviceInstanceId);
  if (!["MONTHLY", "YEARLY"].includes(service.billing_cycle)) throw new Error("This hosting service is not configured for recurring billing.");
  if (!Number.isSafeInteger(service.renewal_price_cents) || Number(service.renewal_price_cents) <= 0) throw new Error("A verified hosting renewal price is not configured.");

  const operational = await getHostingOperationalState();
  if (!operational.configured || !operational.verified) throw new Error(operational.reason || "The WHM hosting provider is not verified.");

  const meta = await getProductCommerceMeta(service.product_id);
  if (!meta || meta.wholesaleCostCents == null || meta.costSource === "UNKNOWN" || !meta.costVerifiedAt) throw new Error("Verified hosting wholesale cost is missing.");
  if (meta.wholesaleCurrency.toUpperCase() !== service.currency.toUpperCase()) throw new Error("Hosting wholesale and retail currencies do not match.");
  const policy = await getPricingSafetyPolicy();
  const minimumRetailCents = computeSafeRetailPrice(meta.wholesaleCostCents, policy).retailCents;
  const renewalPriceCents = Number(service.renewal_price_cents);
  if (renewalPriceCents < minimumRetailCents) throw new Error("Hosting renewal price is below the protected wholesale/margin floor.");

  return {
    service,
    renewalPriceCents,
    minimumRetailCents,
    currency: service.currency.toUpperCase(),
    description: `${service.product_name} renewal — ${service.billing_cycle === "MONTHLY" ? "1 month" : "1 year"}`,
  };
}

export async function ensureHostingSubscription(serviceInstanceId: string) {
  const quote = await getProtectedHostingRenewalQuote(serviceInstanceId);
  const service = quote.service;
  const periodStart = new Date();
  const periodEnd = addCycle(periodStart, service.billing_cycle);
  const nextAt = nextBillingAt(periodEnd, service.billing_cycle);

  await prisma.$executeRaw`
    INSERT INTO "billing_subscriptions"
      ("id","user_id","product_id","service_instance_id","provider","status","billing_cycle","amount_cents","currency","current_period_start","current_period_end","next_billing_at","auto_renew")
    VALUES
      (${crypto.randomUUID()},${service.user_id},${service.product_id},${service.id},'paypal','ACTIVE',${service.billing_cycle},${quote.renewalPriceCents},${quote.currency},${periodStart},${periodEnd},${nextAt},TRUE)
    ON CONFLICT ("service_instance_id") WHERE "service_instance_id" IS NOT NULL DO UPDATE SET
      "product_id"=EXCLUDED."product_id",
      "billing_cycle"=EXCLUDED."billing_cycle",
      "amount_cents"=EXCLUDED."amount_cents",
      "currency"=EXCLUDED."currency",
      "updated_at"=CURRENT_TIMESTAMP
  `;
}

export async function createHostingRenewalOrder(subscription: HostingSubscriptionRef): Promise<{ orderId: string; created: boolean }> {
  const quote = await getProtectedHostingRenewalQuote(subscription.serviceInstanceId);
  if (quote.service.user_id !== subscription.userId) throw new Error("Hosting subscription ownership does not match the service owner.");

  const idempotencyKey = `renewal:${subscription.id}:${subscription.currentPeriodEnd.toISOString()}`;
  const existing = await prisma.$queryRaw<Array<{ order_id: string | null }>>`
    SELECT "order_id" FROM "billing_renewal_attempts" WHERE "idempotency_key"=${idempotencyKey} LIMIT 1
  `;
  if (existing[0]?.order_id) return { orderId: existing[0].order_id, created: false };

  for (let attempt = 0; attempt < 4; attempt++) {
    const [orderCount, invoiceCount] = await Promise.all([prisma.order.count(), prisma.invoice.count()]);
    const orderNumber = generateOrderNumber(orderCount + 1 + attempt);
    const invoiceNumber = generateInvoiceNumber(invoiceCount + 1 + attempt);
    try {
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            orderNumber,
            userId: subscription.userId,
            status: "PENDING_PAYMENT",
            subtotalCents: quote.renewalPriceCents,
            discountCents: 0,
            taxCents: 0,
            totalCents: quote.renewalPriceCents,
            currency: quote.currency,
            idempotencyKey: crypto.randomUUID(),
            items: { create: [{
              productId: quote.service.product_id,
              description: quote.description,
              quantity: 1,
              unitPriceCents: quote.renewalPriceCents,
              discountCents: 0,
              totalCents: quote.renewalPriceCents,
            }] },
            invoice: { create: {
              invoiceNumber,
              userId: subscription.userId,
              subtotalCents: quote.renewalPriceCents,
              discountCents: 0,
              taxCents: 0,
              totalCents: quote.renewalPriceCents,
              currency: quote.currency,
              status: "UNPAID",
              billingName: `${quote.service.first_name} ${quote.service.last_name}`,
              billingEmail: quote.service.customer_email,
              billingCountry: quote.service.country ?? undefined,
            } },
          },
        });
        await tx.$executeRaw`
          INSERT INTO "billing_renewal_attempts"
            ("id","subscription_id","period_end","status","order_id","idempotency_key","scheduled_at")
          VALUES
            (${crypto.randomUUID()},${subscription.id},${subscription.currentPeriodEnd},'ORDER_CREATED',${created.id},${idempotencyKey},CURRENT_TIMESTAMP)
          ON CONFLICT ("idempotency_key") DO NOTHING
        `;
        return created;
      });

      await prisma.$executeRaw`
        UPDATE "billing_subscriptions" SET "last_renewal_order_id"=${order.id},"amount_cents"=${quote.renewalPriceCents},"currency"=${quote.currency},"updated_at"=CURRENT_TIMESTAMP
        WHERE "id"=${subscription.id}
      `;
      await logAudit({ actorId: subscription.userId, action: "hosting.renewal_order_created", resource: "order", resourceId: order.id, metadata: { subscriptionId: subscription.id, serviceInstanceId: subscription.serviceInstanceId } });
      await notifyOrderLifecycle({
        orderId: order.id,
        orderNumber,
        userId: subscription.userId,
        email: quote.service.customer_email,
        type: "HOSTING_RENEWAL_INVOICE",
        title: `Hosting renewal ready for ${quote.service.domain_name || quote.service.product_name}`,
        body: `Your hosting renewal invoice is ready. Complete payment before the current service period ends to avoid suspension.`,
        emailSubject: `Hosting renewal ready — ${quote.service.domain_name || quote.service.product_name}`,
        emailHtml: `<p>Your hosting renewal invoice for <strong>${escapeHtml(quote.service.domain_name || quote.service.product_name)}</strong> is ready.</p><p>Amount due: <strong>${escapeHtml((quote.renewalPriceCents / 100).toFixed(2))} ${escapeHtml(quote.currency)}</strong>.</p>`,
      });
      return { orderId: order.id, created: true };
    } catch (error: any) {
      if (error?.code === "P2002" && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Could not create a unique hosting renewal invoice.");
}

export async function refreshHostingRenewalOrderPrice(params: { orderId: string; userId: string; subscriptionId: string; serviceInstanceId: string }) {
  const quote = await getProtectedHostingRenewalQuote(params.serviceInstanceId);
  if (quote.service.user_id !== params.userId) throw new Error("Hosting renewal does not belong to this customer.");
  const order = await prisma.order.findFirst({ where: { id: params.orderId, userId: params.userId }, include: { items: true, invoice: true } });
  if (!order || order.status !== "PENDING_PAYMENT") throw new Error("Hosting renewal order is not awaiting payment.");
  const item = order.items.find((candidate) => candidate.productId === quote.service.product_id) ?? order.items[0];
  if (!item) throw new Error("Hosting renewal order item is missing.");

  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { subtotalCents: quote.renewalPriceCents, discountCents: 0, totalCents: quote.renewalPriceCents, currency: quote.currency } });
    await tx.orderItem.update({ where: { id: item.id }, data: { description: quote.description, unitPriceCents: quote.renewalPriceCents, discountCents: 0, totalCents: quote.renewalPriceCents } });
    if (order.invoice) await tx.invoice.update({ where: { id: order.invoice.id }, data: { subtotalCents: quote.renewalPriceCents, discountCents: 0, totalCents: quote.renewalPriceCents, currency: quote.currency } });
    await tx.$executeRaw`UPDATE "billing_subscriptions" SET "amount_cents"=${quote.renewalPriceCents},"currency"=${quote.currency},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${params.subscriptionId}`;
  });
  return quote;
}

export async function advanceHostingSubscriptionAfterPayment(subscriptionId: string) {
  const rows = await prisma.$queryRaw<Array<{ current_period_end: Date; billing_cycle: string; service_instance_id: string | null }>>`
    SELECT "current_period_end","billing_cycle","service_instance_id" FROM "billing_subscriptions" WHERE "id"=${subscriptionId} LIMIT 1
  `;
  const row = rows[0];
  if (!row?.service_instance_id) return false;
  const periodStart = row.current_period_end;
  const periodEnd = addCycle(periodStart, row.billing_cycle);
  const nextAt = nextBillingAt(periodEnd, row.billing_cycle);
  await prisma.$executeRaw`
    UPDATE "billing_subscriptions" SET
      "status"='ACTIVE',"current_period_start"=${periodStart},"current_period_end"=${periodEnd},"next_billing_at"=${nextAt},
      "grace_until"=NULL,"failed_payment_count"=0,"last_payment_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP
    WHERE "id"=${subscriptionId}
  `;
  return true;
}

export async function reactivateHostingServiceAfterPaidRenewal(serviceInstanceId: string) {
  const service = await getHostingService(serviceInstanceId);
  if (service.status === "ACTIVE") return;
  if (service.status !== "SUSPENDED") throw new Error(`Hosting service cannot be reactivated from ${service.status}.`);
  const operational = await getHostingOperationalState();
  if (!operational.verified) throw new Error(operational.reason || "WHM hosting is not operational.");
  const provider = getHostingProvider();
  await provider.unsuspendAccount(service.provider_resource_id);
  await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='ACTIVE',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
  await logAudit({ actorId: service.user_id, action: "hosting.reactivated_after_payment", resource: "hosting_service", resourceId: service.id });
}

export async function enforceHostingPastDue(limit = 100) {
  const operational = await getHostingOperationalState();
  if (!operational.verified) return { inspected: 0, suspended: 0, skipped: 0, providerReady: false };
  const rows = await prisma.$queryRaw<Array<{ subscription_id: string; service_instance_id: string; provider_resource_id: string; user_id: string }>>`
    SELECT bs."id" AS "subscription_id",bs."service_instance_id",psi."provider_resource_id",psi."user_id"
    FROM "billing_subscriptions" bs
    JOIN "product_service_instances" psi ON psi."id"=bs."service_instance_id"
    WHERE bs."status"='PAST_DUE' AND bs."grace_until" IS NOT NULL AND bs."grace_until"<=CURRENT_TIMESTAMP
      AND psi."status"='ACTIVE' AND psi."provider_name"='cpanel_whm'
    ORDER BY bs."grace_until" ASC LIMIT ${limit}
  `;
  const provider = getHostingProvider();
  let suspended = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await provider.suspendAccount(row.provider_resource_id, "GetSawa hosting renewal payment overdue");
      await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENDED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.service_instance_id} AND "status"='ACTIVE'`;
      await logAudit({ actorId: null, action: "hosting.suspended_for_nonpayment", resource: "hosting_service", resourceId: row.service_instance_id, metadata: { subscriptionId: row.subscription_id, userId: row.user_id } });
      suspended++;
    } catch (error) {
      skipped++;
      await logAudit({ actorId: null, action: "hosting.suspension_failed", resource: "hosting_service", resourceId: row.service_instance_id, metadata: { subscriptionId: row.subscription_id, reason: error instanceof Error ? error.message.slice(0, 400) : "Unknown WHM suspension failure" } }).catch(() => undefined);
    }
  }
  return { inspected: rows.length, suspended, skipped, providerReady: true };
}

export async function getHostingRenewalServiceForOrder(orderId: string) {
  const rows = await prisma.$queryRaw<Array<{ subscription_id: string; service_instance_id: string | null }>>`
    SELECT ra."subscription_id",bs."service_instance_id"
    FROM "billing_renewal_attempts" ra JOIN "billing_subscriptions" bs ON bs."id"=ra."subscription_id"
    WHERE ra."order_id"=${orderId} LIMIT 1
  `;
  const row = rows[0];
  return row?.service_instance_id ? { subscriptionId: row.subscription_id, serviceInstanceId: row.service_instance_id } : null;
}

function escapeHtml(input: string) {
  return input.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[character] as string));
}
