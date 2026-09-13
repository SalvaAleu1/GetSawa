import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber, generateOrderNumber } from "@/lib/pricing";
import { getProductCommerceMeta } from "@/lib/product-readiness";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";
import { getSecurityOperationalState } from "@/lib/security-readiness";
import { getCloudflareSecurityProvider } from "@/lib/providers/security/CloudflareSecurityProvider";
import { logAudit } from "@/lib/audit";
import { notifyOrderLifecycle } from "@/lib/order-notifications";

export interface SecuritySubscriptionRef { id: string; userId: string; serviceInstanceId: string; currentPeriodEnd: Date; billingCycle: string; }
interface SecurityServiceRow {
  id: string; user_id: string; product_id: string; domain_id: string | null; provider_name: string; provider_resource_id: string; status: string;
  billing_cycle: string; renewal_price_cents: number | null; currency: string; product_name: string; customer_email: string;
  first_name: string; last_name: string; country: string | null; domain_name: string | null; proxy_desired: boolean;
}

function addCycle(start: Date, cycle: string) {
  const next = new Date(start);
  if (cycle === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + 1);
  else if (cycle === "YEARLY") next.setUTCFullYear(next.getUTCFullYear() + 1);
  else throw new Error("Unsupported security billing cycle.");
  return next;
}
function nextBillingAt(periodEnd: Date, cycle: string) { return new Date(periodEnd.getTime() - (cycle === "MONTHLY" ? 3 : 7) * 86400000); }

async function getSecurityService(serviceInstanceId: string): Promise<SecurityServiceRow> {
  const rows = await prisma.$queryRaw<SecurityServiceRow[]>`
    SELECT psi."id",psi."user_id",psi."product_id",psi."domain_id",psi."provider_name",psi."provider_resource_id",psi."status",
           p."billingCycle" AS "billing_cycle",p."renewalPriceCents" AS "renewal_price_cents",p."currency",p."name" AS "product_name",
           u."email" AS "customer_email",u."firstName" AS "first_name",u."lastName" AS "last_name",u."country",d."name" AS "domain_name",
           COALESCE(czs."proxy_desired",FALSE) AS "proxy_desired"
    FROM "product_service_instances" psi
    JOIN "Product" p ON p."id"=psi."product_id"
    JOIN "User" u ON u."id"=psi."user_id"
    LEFT JOIN "Domain" d ON d."id"=psi."domain_id"
    LEFT JOIN "cloudflare_zone_services" czs ON czs."service_instance_id"=psi."id"
    WHERE psi."id"=${serviceInstanceId} LIMIT 1
  `;
  const service = rows[0];
  if (!service) throw new Error("Cloudflare security service was not found.");
  if (service.provider_name !== "cloudflare") throw new Error("This service is not backed by Cloudflare.");
  if (service.status === "TERMINATED") throw new Error("A terminated security service cannot be renewed.");
  return service;
}

export async function getProtectedSecurityRenewalQuote(serviceInstanceId: string) {
  const service = await getSecurityService(serviceInstanceId);
  if (!["MONTHLY", "YEARLY"].includes(service.billing_cycle)) throw new Error("This security service is not recurring.");
  const operational = await getSecurityOperationalState();
  if (!operational.verified) throw new Error(operational.reason || "Cloudflare security provider is not verified.");
  const meta = await getProductCommerceMeta(service.product_id);
  if (!meta || meta.wholesaleCostCents == null || meta.costSource === "UNKNOWN" || !meta.costVerifiedAt) throw new Error("Verified security-service cost is missing.");
  if (meta.wholesaleCurrency.toUpperCase() !== service.currency.toUpperCase()) throw new Error("Security wholesale and retail currencies do not match.");
  const minimumRetailCents = computeSafeRetailPrice(meta.wholesaleCostCents, await getPricingSafetyPolicy()).retailCents;
  const renewalPriceCents = Number(service.renewal_price_cents);
  if (!Number.isSafeInteger(renewalPriceCents) || renewalPriceCents <= 0 || renewalPriceCents < minimumRetailCents) throw new Error("Security renewal price does not pass the protected cost/margin floor.");
  return { service, renewalPriceCents, minimumRetailCents, currency: service.currency.toUpperCase(), description: `${service.product_name} renewal — ${service.billing_cycle === "MONTHLY" ? "1 month" : "1 year"}` };
}

export async function ensureSecuritySubscription(serviceInstanceId: string) {
  const quote = await getProtectedSecurityRenewalQuote(serviceInstanceId);
  const start = new Date(); const end = addCycle(start, quote.service.billing_cycle);
  await prisma.$executeRaw`
    INSERT INTO "billing_subscriptions" ("id","user_id","product_id","service_instance_id","provider","status","billing_cycle","amount_cents","currency","current_period_start","current_period_end","next_billing_at","auto_renew")
    VALUES (${crypto.randomUUID()},${quote.service.user_id},${quote.service.product_id},${quote.service.id},'paypal','ACTIVE',${quote.service.billing_cycle},${quote.renewalPriceCents},${quote.currency},${start},${end},${nextBillingAt(end, quote.service.billing_cycle)},TRUE)
    ON CONFLICT ("service_instance_id") WHERE "service_instance_id" IS NOT NULL DO UPDATE SET "product_id"=EXCLUDED."product_id","billing_cycle"=EXCLUDED."billing_cycle","amount_cents"=EXCLUDED."amount_cents","currency"=EXCLUDED."currency","updated_at"=CURRENT_TIMESTAMP
  `;
}

export async function createSecurityRenewalOrder(subscription: SecuritySubscriptionRef): Promise<{ orderId: string; created: boolean }> {
  const quote = await getProtectedSecurityRenewalQuote(subscription.serviceInstanceId);
  if (quote.service.user_id !== subscription.userId) throw new Error("Security subscription ownership mismatch.");
  const key = `renewal:${subscription.id}:${subscription.currentPeriodEnd.toISOString()}`;
  const existing = await prisma.$queryRaw<Array<{ order_id: string | null }>>`SELECT "order_id" FROM "billing_renewal_attempts" WHERE "idempotency_key"=${key} LIMIT 1`;
  if (existing[0]?.order_id) return { orderId: existing[0].order_id, created: false };
  for (let attempt = 0; attempt < 4; attempt++) {
    const [orders, invoices] = await Promise.all([prisma.order.count(), prisma.invoice.count()]);
    try {
      const orderNumber = generateOrderNumber(orders + 1 + attempt); const invoiceNumber = generateInvoiceNumber(invoices + 1 + attempt);
      const order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({ data: {
          orderNumber,userId: subscription.userId,status:"PENDING_PAYMENT",subtotalCents:quote.renewalPriceCents,discountCents:0,taxCents:0,totalCents:quote.renewalPriceCents,currency:quote.currency,idempotencyKey:crypto.randomUUID(),
          items:{create:[{productId:quote.service.product_id,description:quote.description,quantity:1,unitPriceCents:quote.renewalPriceCents,discountCents:0,totalCents:quote.renewalPriceCents}]},
          invoice:{create:{invoiceNumber,userId:subscription.userId,subtotalCents:quote.renewalPriceCents,discountCents:0,taxCents:0,totalCents:quote.renewalPriceCents,currency:quote.currency,status:"UNPAID",billingName:`${quote.service.first_name} ${quote.service.last_name}`,billingEmail:quote.service.customer_email,billingCountry:quote.service.country ?? undefined}}
        }});
        await tx.$executeRaw`INSERT INTO "billing_renewal_attempts" ("id","subscription_id","period_end","status","order_id","idempotency_key","scheduled_at") VALUES (${crypto.randomUUID()},${subscription.id},${subscription.currentPeriodEnd},'ORDER_CREATED',${created.id},${key},CURRENT_TIMESTAMP) ON CONFLICT ("idempotency_key") DO NOTHING`;
        return created;
      });
      await prisma.$executeRaw`UPDATE "billing_subscriptions" SET "last_renewal_order_id"=${order.id},"amount_cents"=${quote.renewalPriceCents},"currency"=${quote.currency},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${subscription.id}`;
      await notifyOrderLifecycle({ orderId: order.id, orderNumber, userId: subscription.userId, email: quote.service.customer_email, type: "SECURITY_RENEWAL_INVOICE", title: `Security renewal ready for ${quote.service.domain_name || quote.service.product_name}`, body: "Your Cloudflare security renewal invoice is ready. Complete payment before the paid period ends to keep CDN/security management active.", emailSubject: `Security renewal ready — ${quote.service.domain_name || quote.service.product_name}`, emailHtml: `<p>Your GetSawa security renewal for <strong>${escapeHtml(quote.service.domain_name || quote.service.product_name)}</strong> is ready.</p>` });
      return { orderId: order.id, created: true };
    } catch (error: any) { if (error?.code === "P2002" && attempt < 3) continue; throw error; }
  }
  throw new Error("Could not create a unique security renewal invoice.");
}

export async function refreshSecurityRenewalOrderPrice(params: { orderId: string; userId: string; subscriptionId: string; serviceInstanceId: string }) {
  const quote = await getProtectedSecurityRenewalQuote(params.serviceInstanceId);
  const order = await prisma.order.findFirst({ where: { id: params.orderId, userId: params.userId }, include: { items: true, invoice: true } });
  if (!order || order.status !== "PENDING_PAYMENT") throw new Error("Security renewal order is not awaiting payment.");
  const item = order.items[0]; if (!item) throw new Error("Security renewal order item is missing.");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where:{id:order.id},data:{subtotalCents:quote.renewalPriceCents,discountCents:0,totalCents:quote.renewalPriceCents,currency:quote.currency} });
    await tx.orderItem.update({ where:{id:item.id},data:{description:quote.description,unitPriceCents:quote.renewalPriceCents,discountCents:0,totalCents:quote.renewalPriceCents} });
    if (order.invoice) await tx.invoice.update({ where:{id:order.invoice.id},data:{subtotalCents:quote.renewalPriceCents,discountCents:0,totalCents:quote.renewalPriceCents,currency:quote.currency} });
    await tx.$executeRaw`UPDATE "billing_subscriptions" SET "amount_cents"=${quote.renewalPriceCents},"currency"=${quote.currency},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${params.subscriptionId}`;
  });
  return quote;
}

export async function advanceSecuritySubscriptionAfterPayment(subscriptionId: string) {
  const rows = await prisma.$queryRaw<Array<{ current_period_end: Date; billing_cycle: string; service_instance_id: string | null }>>`SELECT "current_period_end","billing_cycle","service_instance_id" FROM "billing_subscriptions" WHERE "id"=${subscriptionId} LIMIT 1`;
  const row = rows[0]; if (!row?.service_instance_id) return false;
  const end = addCycle(row.current_period_end, row.billing_cycle);
  await prisma.$executeRaw`UPDATE "billing_subscriptions" SET "status"='ACTIVE',"current_period_start"=${row.current_period_end},"current_period_end"=${end},"next_billing_at"=${nextBillingAt(end,row.billing_cycle)},"grace_until"=NULL,"failed_payment_count"=0,"last_payment_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${subscriptionId}`;
  const service = await getSecurityService(row.service_instance_id);
  if (service.status === "SUSPENDED" && service.proxy_desired) {
    const operational = await getSecurityOperationalState();
    if (operational.verified && service.domain_name) {
      await getCloudflareSecurityProvider().setWebProxy(service.provider_resource_id, true, service.domain_name);
      await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='ACTIVE',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
      await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "proxy_enabled"=TRUE,"updated_at"=CURRENT_TIMESTAMP WHERE "service_instance_id"=${service.id}`;
    }
  }
  return true;
}

export async function getSecurityRenewalServiceForOrder(orderId: string) {
  const rows = await prisma.$queryRaw<Array<{ subscription_id: string; service_instance_id: string }>>`
    SELECT ra."subscription_id",bs."service_instance_id" FROM "billing_renewal_attempts" ra JOIN "billing_subscriptions" bs ON bs."id"=ra."subscription_id" JOIN "product_service_instances" psi ON psi."id"=bs."service_instance_id"
    WHERE ra."order_id"=${orderId} AND psi."provider_name"='cloudflare' LIMIT 1
  `;
  return rows[0] ? { subscriptionId: rows[0].subscription_id, serviceInstanceId: rows[0].service_instance_id } : null;
}

export async function enforceSecurityPastDue(limit = 100) {
  const operational = await getSecurityOperationalState(); if (!operational.verified) return { inspected:0,suspended:0,skipped:0,providerReady:false };
  const rows = await prisma.$queryRaw<Array<{ subscription_id:string|null;service_instance_id:string;zone_id:string;zone_name:string;user_id:string }>>`
    SELECT bs."id" AS subscription_id,psi."id" AS service_instance_id,czs."zone_id",czs."zone_name",psi."user_id"
    FROM "product_service_instances" psi JOIN "cloudflare_zone_services" czs ON czs."service_instance_id"=psi."id" LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id"
    WHERE psi."provider_name"='cloudflare' AND psi."status" IN ('ACTIVE','SUSPENSION_PENDING') AND (psi."status"='SUSPENSION_PENDING' OR (bs."status"='PAST_DUE' AND bs."grace_until"<=CURRENT_TIMESTAMP) OR (bs."cancel_at_period_end"=TRUE AND bs."current_period_end"<=CURRENT_TIMESTAMP)) LIMIT ${limit}
  `;
  let suspended=0,skipped=0; const provider=getCloudflareSecurityProvider();
  for (const row of rows) { try {
    await provider.setWebProxy(row.zone_id,false,row.zone_name);
    await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENDED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.service_instance_id}`;
    await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "proxy_enabled"=FALSE,"updated_at"=CURRENT_TIMESTAMP WHERE "service_instance_id"=${row.service_instance_id}`;
    if(row.subscription_id) await prisma.$executeRaw`UPDATE "billing_subscriptions" SET "status"=CASE WHEN "cancel_at_period_end"=TRUE AND "current_period_end"<=CURRENT_TIMESTAMP THEN 'EXPIRED' ELSE "status" END,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.subscription_id}`;
    suspended++;
  } catch(error){ skipped++; await logAudit({actorId:null,action:"security.suspension_failed",resource:"security_service",resourceId:row.service_instance_id,metadata:{reason:error instanceof Error?error.message:"Unknown failure"}}).catch(()=>undefined); } }
  return { inspected:rows.length,suspended,skipped,providerReady:true };
}

export async function handleFullyRefundedSecurityOrder(orderId: string) {
  const rows = await prisma.$queryRaw<Array<{id:string;provider_resource_id:string;user_id:string;zone_name:string;status:string}>>`
    SELECT DISTINCT psi."id",psi."provider_resource_id",psi."user_id",czs."zone_name",psi."status" FROM "product_service_instances" psi JOIN "cloudflare_zone_services" czs ON czs."service_instance_id"=psi."id"
    LEFT JOIN "OrderItem" oi ON oi."id"=psi."order_item_id" LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id" LEFT JOIN "billing_renewal_attempts" ra ON ra."subscription_id"=bs."id"
    WHERE psi."provider_name"='cloudflare' AND (oi."orderId"=${orderId} OR ra."order_id"=${orderId})
  `;
  const operational=await getSecurityOperationalState(); const provider=getCloudflareSecurityProvider(); let suspended=0,pending=0;
  for(const row of rows){ await prisma.$executeRaw`UPDATE "billing_subscriptions" SET "status"='CANCELLED',"auto_renew"=FALSE,"cancel_at_period_end"=TRUE,"updated_at"=CURRENT_TIMESTAMP WHERE "service_instance_id"=${row.id}`;
    if(row.status==='SUSPENDED'||row.status==='TERMINATED') continue;
    if(operational.verified){ try{await provider.setWebProxy(row.provider_resource_id,false,row.zone_name);await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENDED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "proxy_enabled"=FALSE,"proxy_desired"=FALSE,"updated_at"=CURRENT_TIMESTAMP WHERE "service_instance_id"=${row.id}`;suspended++;continue;}catch{} }
    await prisma.$executeRaw`UPDATE "product_service_instances" SET "status"='SUSPENSION_PENDING',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;pending++;
  }
  return {found:rows.length,suspended,pending};
}

function escapeHtml(input:string){return input.replace(/[&<>\"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c] as string));}
