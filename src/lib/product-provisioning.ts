import crypto from "crypto";
import type { Order, OrderItem, Product, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProductReadiness, getProductCommerceMeta, validateProductConfiguration } from "@/lib/product-readiness";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";

export async function provisionCatalogProduct(params: { order: Order & { user: User }; item: OrderItem }) {
  if (!params.item.productId) throw new Error("Catalog order item is missing its product reference.");
  const product = await prisma.product.findUnique({ where: { id: params.item.productId } });
  if (!product) throw new Error("Catalog product no longer exists.");
  const readiness = await getProductReadiness(product);
  if (!readiness.purchasable) throw new Error(readiness.reasons[0] || "Product fulfillment is not ready.");
  const configRows = await prisma.$queryRaw<Array<{ domain_id: string | null; configuration: unknown }>>`
    SELECT "domain_id","configuration" FROM "product_order_configuration" WHERE "order_item_id"=${params.item.id} LIMIT 1
  `;
  const configRow = configRows[0];
  const configObject = configRow?.configuration && typeof configRow.configuration === "object" && !Array.isArray(configRow.configuration)
    ? configRow.configuration as Record<string, string>
    : {};
  const validated = await validateProductConfiguration({ product, userId: params.order.userId, domainId: configRow?.domain_id ?? undefined, configuration: configObject });
  const meta = validated.meta;

  const existing = await prisma.$queryRaw<Array<{ id: string; provider_resource_id: string; status: string }>>`
    SELECT "id","provider_resource_id","status" FROM "product_service_instances" WHERE "order_item_id"=${params.item.id} LIMIT 1
  `;
  if (existing[0]) {
    await prisma.orderItem.updateMany({ where: { id: params.item.id, provisioningStatus: "PROVISIONING" }, data: { provisioningStatus: "PROVISIONED", provisioningNote: "Provider service reconciled from existing service instance." } });
    return existing[0];
  }

  if (meta.provisioningContract === "HOSTING_ACCOUNT") {
    if (!validated.domain) throw new Error("Hosting fulfillment requires a managed domain.");
    const provider = getHostingProvider();
    if (!provider.isConfigured()) throw new Error("Hosting provider is not configured.");
    if (!product.providerProductId) throw new Error("Hosting provider plan code is missing.");
    const result = await provider.provisionAccount({ planCode: product.providerProductId, domain: validated.domain.name, customerEmail: params.order.user.email, idempotencyKey: params.item.id });
    if (!result.success || !result.providerAccountId) throw new Error(result.errorMessage || "Hosting provider did not return an account reference.");
    return persistServiceInstance({ item: params.item, product, userId: params.order.userId, domainId: validated.domain.id, providerName: provider.name, providerResourceId: result.providerAccountId, metadata: { controlPanelUrl: result.controlPanelUrl ?? null } });
  }

  if (meta.provisioningContract === "EMAIL_MAILBOX") {
    if (!validated.domain) throw new Error("Mailbox fulfillment requires a managed domain.");
    const provider = getEmailProvider();
    if (!provider.isConfigured()) throw new Error("Business email provider is not configured.");
    const localPart = String(validated.configuration.localPart || "");
    const storageMb = Number(meta.providerConfig.storageMb);
    const result = await provider.createMailbox({ domain: validated.domain.name, localPart, customerEmail: params.order.user.email, storageMb, idempotencyKey: params.item.id });
    if (!result.success || !result.providerMailboxId) throw new Error(result.errorMessage || "Email provider did not return a mailbox reference.");
    return persistServiceInstance({ item: params.item, product, userId: params.order.userId, domainId: validated.domain.id, providerName: provider.name, providerResourceId: result.providerMailboxId, metadata: { address: `${localPart}@${validated.domain.name}`, storageMb } });
  }

  throw new Error(`Provisioning contract ${meta.provisioningContract || "none"} is not implemented.`);
}

async function persistServiceInstance(params: { item: OrderItem; product: Product; userId: string; domainId: string | null; providerName: string; providerResourceId: string; metadata: Record<string, unknown> }) {
  const serviceId = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "product_service_instances" ("id","order_item_id","user_id","product_id","domain_id","provider_name","provider_resource_id","status","metadata")
      VALUES (${serviceId},${params.item.id},${params.userId},${params.product.id},${params.domainId},${params.providerName},${params.providerResourceId},'ACTIVE',${JSON.stringify(params.metadata)}::jsonb)
      ON CONFLICT ("order_item_id") DO NOTHING
    `;
    await tx.orderItem.updateMany({ where: { id: params.item.id, provisioningStatus: "PROVISIONING" }, data: { provisioningStatus: "PROVISIONED", provisioningNote: `Provisioned with ${params.providerName}. Provider reference recorded.` } });
  });
  return { id: serviceId, providerResourceId: params.providerResourceId, status: "ACTIVE" };
}

export async function getCustomerServiceInstances(userId: string) {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT psi."id",psi."status",psi."provider_name" AS "providerName",psi."provider_resource_id" AS "providerResourceId",psi."metadata",psi."created_at" AS "createdAt",
           p."id" AS "productId",p."sku",p."name",p."category",p."billingCycle",d."id" AS "domainId",d."name" AS "domainName"
    FROM "product_service_instances" psi
    JOIN "Product" p ON p."id"=psi."product_id"
    LEFT JOIN "Domain" d ON d."id"=psi."domain_id"
    WHERE psi."user_id"=${userId}
    ORDER BY psi."created_at" DESC
  `;
}
