import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber, generateOrderNumber } from "@/lib/pricing";
import { getProductCommerceMeta } from "@/lib/product-readiness";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { logAudit } from "@/lib/audit";
import { notifyOrderLifecycle } from "@/lib/order-notifications";

export interface EmailSubscriptionRef {
  id: string;
  userId: string;
  serviceInstanceId: string;
  currentPeriodEnd: Date;
  billingCycle: string;
}

interface EmailServiceRow {
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
  else throw new Error("Unsupported email billing cycle.");
  return next;
}

function nextBillingAt(periodEnd: Date, cycle: string) {
  const leadDays = cycle === "MONTHLY" ? 3 : 7;
  return new Date(periodEnd.getTime() - leadDays * 86400000);
}

async function getEmailService(serviceInstanceId: string): Promise<EmailServiceRow> {
  const rows = await prisma.$queryRaw<EmailServiceRow[]>`
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
  if (!service) throw new Error("Email service instance was not found.");
  if (service.provider_name !== "opensrs_hosted_email") throw new Error("This service is not backed by OpenSRS Hosted Email.");
  if (service.status === "TERMINATED") throw new Error("A terminated mailbox cannot be renewed.");
  return service;
}

export async function getProtectedEmailRenewalQuote(serviceInstanceId: string) {
  const service = await getEmailService(serviceInstanceId);
  if (!["MONTHLY", "YEARLY"].includes(service.billing_cycle)) throw new Error("This mailbox is not configured for recurring billing.");
  if (!Number.isSafeInteger(service.renewal_price_cents) || Number(service.renewal_price_cents) <= 0) throw new Error("A verified mailbox renewal price is not configured.");

  const operational = await getEmailOperationalState();
  if (!operational.configured || !operational.verified) throw new Error(operational.reason || "OpenSRS Hosted Email is not verified.");

  const meta = await getProductCommerceMeta(service.product_id);
  if (!meta || meta.wholesaleCostCents == null || meta.costSource === "UNKNOWN" || !meta.costVerifiedAt) throw new Error("Verified mailbox wholesale cost is missing.");
  if (meta.wholesaleCurrency.toUpperCase() !== service.currency.toUpperCase()) throw new Error("Mailbox wholesale and retail currencies do not match.");
  const policy = await getPricingSafetyPolicy();
  const minimumRetailCents = computeSafeRetailPrice(meta.wholesaleCostCents, policy).retailCents;
  const renewalPriceCents = Number(service.renewal_price_cents);
  if (renewalPriceCents < minimumRetailCents) throw new Error("Mailbox renewal price is below the protected wholesale/margin floor.");

  return {
    service,
    renewalPriceCents,
    minimumRetailCents,
    currency: service.currency.toUpperCase(),
    description: `${service.product_name} renewal — ${service.billing_cycle === "MONTHLY" ? "1 month" : "1 year"}`,
  };
}

export async function ensureEmailSubscription(serviceInstanceId: string) {
  const quote = await getProtectedEmailRenewalQuote(serviceInstanceId);
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

export async function createEmailRenewalOrder(subscription: EmailSubscriptionRef): Promise<{ orderId: string; created: boolean }> {
  const quote = await getProtectedEmailRenewalQuote(subscription.serviceInstanceId);
  if (quote.service.user_id !== subscription.userId) throw new Error("Email subscription ownership does not match the mailbox owner.");
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
        UPDATE "billing_subscriptions" SET "last_renewal_order_id"=${order.id},"amount_cents"=${quote.renewalPriceCents},"currency"=${quote.currency},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${subscription.id}
      `;
      await logAudit({ actorId: subscription.userId, action: "email.renewal_order_created", resource: "order", resourceId: order.id, metadata: { subscriptionId: subscription.id, serviceInstanceId: subscription.serviceInstanceId } });
      await notifyOrderLifecycle({
        orderId: order.id,
        orderNumber,
        userId: subscription.userId,
        email: quote.service.customer_email,
        type: "EMAIL_RENEWAL_INVOICE",
        title: `Business email renewal ready for ${quote.service.provider_resource_id}`,
        body: `Your business email renewal invoice is ready. Complete payment before the paid period ends to avoid mailbox suspension.`,
        emailSubject: `Business email renewal ready — ${quote.service.provider_resource_id}`,
        emailHtml: `<p>Your renewal invoice for <strong>${escapeHtml(quote.service.provider_resource_id)}</strong> is ready.</p><p>Amount due: <strong>${escapeHtml((quote.renewalPriceCents / 100).toFixed(2))} ${escapeHtml(quote.currency)}</strong>.</p>`,
      });
      return { orderId: order.id, created: true };
    } catch (error: any) {
      if (error?.code === "P2002" && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Could not create a unique mailbox renewal invoice.");
}

export async function refreshEmailRenewalOrderPrice(params: { orderId: string; userId: string; subscriptionId: string; serviceInstanceId: string }) {
  const quote = await getProtectedEmailRenewalQuote(params.serviceInstanceId);
  if (quote.service.user_id !== params.userId) throw new Error("Mailbox renewal does not belong to this customer.");
  const order = await prisma.order.findFirst({ where: { id: params.orderId, userId: params.userId }, include: { items: true, invoice: true } });
  if (!order || order.status !== "PENDING_PAYMENT") throw new Error("Mailbox renewal order is not awaiting payment.");
  const item = order.items.find((candidate) => candidate.productId === quote.service.product_id) ?? order.items[0];
  if (!item) throw new Error("Mailbox renewal order item is missing.");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { subtotalCents: quote.renewalPriceCents, discountCents: 0, totalCents: quote.renewalPriceCents, currency: quote.currency } });
    await tx.orderItem.update({ where: { id: item.id }, data: { description: quote.description, unitPriceCents: quote.renewalPriceCents, discountCents: 0, totalCents: quote.renewalPriceCents } });
    if (order.invoice) await tx.invoice.update({ where: { id: order.invoice.id }, data: { subtotalCents: quote.renewalPriceCents, discountCents: 0, totalCents: quote.renewalPriceCents, currency: quote.currency } });
    await tx.$executeRaw`UPDATE "billing_subscriptions" SET "amount_cents"=${quote.renewalPriceCents},"currency"=${quote.currency},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${params.subscriptionId}`;
  });
  return quote;
}

export async function advanceEmailSubscriptionAfterPayment(subscriptionId: string) {
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

export async function setEmailAutoRenew(userId: string, serviceInstanceId: string, enabled: boolean) {
  const rows = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id","status" FROM "product_service_instances" WHERE "id"=${serviceInstanceId} AND "user_id"=${userId} AND "provider_name"='opensrs_hosted_email' LIMIT 1
  `;
  const service = rows[0];
  if (!service) throw new Error("Mailbox service not found.");
  if (["TERMINATED", "PROVIDER_ERROR"].includes(service.status)) throw new Error("Renewal settings cannot be changed for this mailbox state.");
  const updated = await prisma.$executeRaw`
    UPDATE "billing_subscriptions" SET "auto_renew"=${enabled},"cancel_at_period_end"=${!enabled},
      "status"=CASE WHEN ${enabled}=TRUE AND "status" IN ('CANCELLED','EXPIRED') THEN 'ACTIVE' ELSE "status" END,
      "updated_at"=CURRENT_TIMESTAMP
    WHERE "service_instance_id"=${serviceInstanceId} AND "user_id"=${userId}
  `;
  if (updated !== 1) throw new Error("Recurring mailbox subscription was not found.");
  await logAudit({ actorId: userId, action: enabled ? "email.autorenew.enabled" : "email.autorenew.disabled", resource: "email_service", resourceId: serviceInstanceId });
}

export async function handleFullyRefundedEmailOrder(orderId: string) {
  const services = await prisma.$queryRaw<Array<{ id: string; user_id: string; provider_resource_id: string; status: string }>>`
    SELECT DISTINCT service."id",service."user_id",service."provider_resource_id",service."status"
    FROM (
      SELECT psi."id",psi."user_id",psi."provider_resource_id",psi."status"
      FROM "product_service_instances" psi JOIN "OrderItem" oi ON oi."id"=psi."order_item_id"
      WHERE oi."orderId"=${orderId} AND psi."provider_name"='opensrs_hosted_email'
      UNION
      SELECT psi."id",psi."user_id",psi."provider_resource_id",psi."status"
      FROM "billing_renewal_attempts" ra JOIN "billing_subscriptions" bs ON bs."id"=ra."subscription_id"
      JOIN "product_service_instances" psi ON psi."id"=bs."service_instance_id"
      WHERE ra."order_id"=${orderId} AND psi."provider_name"='opensrs_hosted_email'
    ) AS service
  `;
  if (services.length === 0) return { found: 0, suspended: 0, pending: 0 };
  const operational = await getEmailOperationalState();
  const provider = getEmailProvider();
  let suspended = 0;
  let pending = 0;
  for (const service of services) {
    await prisma.$executeRaw`UPDATE "billing_subscriptions" SET "status"='CANCELLED',"auto_renew"=FALSE,"cancel_at_period_end"=TRUE,"updated_at"=CURRENT_TIMESTAMP WHERE "service_instance_id"=${service.id}`;
    if (service.status === "TERMINATED" || service.status === "SUSPENDED") continue;
    if (operational.verified) {
      try {
        await provider.suspendMailbox(service.provider_resource_id);
        await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENDED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
        suspended++;
        continue;
      } catch (error) {
        await logAudit({ actorId: null, action: "email.refund_suspension_failed", resource: "email_service", resourceId: service.id, metadata: { orderId, reason: error instanceof Error ? error.message.slice(0, 400) : "Unknown email suspension failure" } }).catch(() => undefined);
      }
    }
    await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENSION_PENDING',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
    pending++;
  }
  return { found: services.length, suspended, pending };
}

export async function enforceEmailPastDue(limit = 100) {
  const operational = await getEmailOperationalState();
  if (!operational.verified) return { inspected: 0, suspended: 0, skipped: 0, providerReady: false };
  const rows = await prisma.$queryRaw<Array<{ subscription_id: string | null; service_instance_id: string; provider_resource_id: string; user_id: string; enforcement_reason: "PAST_DUE" | "PERIOD_ENDED" | "SUSPENSION_PENDING" }>>`
    SELECT bs."id" AS "subscription_id",psi."id" AS "service_instance_id",psi."provider_resource_id",psi."user_id",
      CASE WHEN psi."status"='SUSPENSION_PENDING' THEN 'SUSPENSION_PENDING'
           WHEN bs."cancel_at_period_end"=TRUE AND bs."current_period_end"<=CURRENT_TIMESTAMP THEN 'PERIOD_ENDED'
           ELSE 'PAST_DUE' END AS enforcement_reason
    FROM "product_service_instances" psi
    LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id"
    WHERE psi."provider_name"='opensrs_hosted_email' AND psi."status" IN ('ACTIVE','SUSPENSION_PENDING')
      AND (psi."status"='SUSPENSION_PENDING'
        OR (bs."status"='PAST_DUE' AND bs."grace_until" IS NOT NULL AND bs."grace_until"<=CURRENT_TIMESTAMP)
        OR (bs."status" IN ('ACTIVE','PAST_DUE') AND bs."cancel_at_period_end"=TRUE AND bs."current_period_end"<=CURRENT_TIMESTAMP))
    ORDER BY COALESCE(bs."grace_until",bs."current_period_end",CURRENT_TIMESTAMP) ASC LIMIT ${limit}
  `;
  const provider = getEmailProvider();
  let suspended = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await provider.suspendMailbox(row.provider_resource_id);
      await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENDED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.service_instance_id}`;
      if (row.subscription_id && row.enforcement_reason === "PERIOD_ENDED") await prisma.$executeRaw`UPDATE "billing_subscriptions" SET "status"='EXPIRED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.subscription_id}`;
      await logAudit({ actorId: null, action: "email.suspended", resource: "email_service", resourceId: row.service_instance_id, metadata: { subscriptionId: row.subscription_id, userId: row.user_id, reason: row.enforcement_reason } });
      suspended++;
    } catch (error) {
      skipped++;
      await logAudit({ actorId: null, action: "email.suspension_failed", resource: "email_service", resourceId: row.service_instance_id, metadata: { subscriptionId: row.subscription_id, reason: error instanceof Error ? error.message.slice(0, 400) : "Unknown email suspension failure" } }).catch(() => undefined);
    }
  }
  return { inspected: rows.length, suspended, skipped, providerReady: true };
}

export async function getEmailRenewalServiceForOrder(orderId: string) {
  const rows = await prisma.$queryRaw<Array<{ subscription_id: string; service_instance_id: string | null }>>`
    SELECT ra."subscription_id",bs."service_instance_id" FROM "billing_renewal_attempts" ra
    JOIN "billing_subscriptions" bs ON bs."id"=ra."subscription_id"
    JOIN "product_service_instances" psi ON psi."id"=bs."service_instance_id"
    WHERE ra."order_id"=${orderId} AND psi."provider_name"='opensrs_hosted_email' LIMIT 1
  `;
  const row = rows[0];
  return row?.service_instance_id ? { subscriptionId: row.subscription_id, serviceInstanceId: row.service_instance_id } : null;
}

function escapeHtml(input: string) {
  return input.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[character] as string));
}
