import { Order, OrderItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { decryptSecret } from "@/lib/crypto";
import { formatCents } from "@/lib/money";
import { transitionOrderStatus } from "@/lib/order-lifecycle";
import { notifyOrderLifecycle } from "@/lib/order-notifications";
import { logAudit } from "@/lib/audit";

const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * Paid-order fulfilment coordinator.
 *
 * Provider calls are idempotent through the order-item id. Each item is
 * claimed before an external call, and stale claims can be recovered. A
 * provider timeout is reconciled where the registrar supports it before a
 * paid item is declared failed.
 */
export async function provisionOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, user: true } });
  if (!order) throw new Error("Order not found during provisioning.");
  if (!["PAYMENT_CONFIRMED", "PROVISIONING"].includes(order.status)) return;

  await transitionOrderStatus({ orderId: order.id, to: "PROVISIONING", reason: "Paid order entered fulfilment workflow." });

  await notifyOrderLifecycle({
    orderId: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    email: order.user.email,
    type: "ORDER_PROVISIONING",
    title: `Order ${order.orderNumber} is being processed`,
    body: `Your order ${order.orderNumber} has been paid and fulfilment is now in progress.`,
    emailSubject: `Order ${order.orderNumber} is being processed`,
    emailHtml: `<p>Your order <strong>${escapeHtml(order.orderNumber)}</strong> has been paid and fulfilment is now in progress.</p>`,
  });

  for (const item of order.items) {
    if (item.provisioningStatus === "PROVISIONED") continue;

    const claimed = await claimProvisioningItem(item);
    if (!claimed) continue;

    try {
      if (!item.productId && !item.domainId && !item.domainTransferId && item.years) {
        await provisionDomainRegistration(order, item);
      } else if (!item.productId && item.domainId && item.years) {
        await provisionDomainRenewal(order, item);
      } else if (item.domainTransferId) {
        await provisionDomainTransfer(order, item);
      } else {
        throw new Error("This paid item has no configured fulfilment provider.");
      }
    } catch (err: unknown) {
      const internalMessage = err instanceof Error ? err.message : "Unknown provisioning error.";
      await prisma.orderItem.updateMany({
        where: { id: item.id, provisioningStatus: "PROVISIONING" },
        data: {
          provisioningStatus: "FAILED",
          provisioningNote: `Provisioning failed. Retry is available from the order workflow. Ref: ${item.id}`,
        },
      });
      try {
        await logAudit({
          actorId: null,
          action: "ORDER_ITEM_PROVISIONING_FAILED",
          resource: "order_item",
          resourceId: item.id,
          metadata: { orderId: order.id, reason: internalMessage.slice(0, 500) },
        });
      } catch {
        // Never replace the durable FAILED state with an audit failure.
      }
    }
  }

  const refreshed = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const allProvisioned = refreshed.length > 0 && refreshed.every((i) => i.provisioningStatus === "PROVISIONED");
  const anyFailed = refreshed.some((i) => i.provisioningStatus === "FAILED");
  const anyInProgress = refreshed.some((i) => i.provisioningStatus === "PROVISIONING");

  if (allProvisioned) {
    await transitionOrderStatus({ orderId: order.id, to: "ACTIVE", reason: "All paid order items were provisioned successfully." });
    await notifyOrderLifecycle({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      email: order.user.email,
      type: "ORDER_ACTIVE",
      title: `Order ${order.orderNumber} is complete`,
      body: `All services in order ${order.orderNumber} have been successfully provisioned.`,
      emailSubject: `Order ${order.orderNumber} is complete`,
      emailHtml: `<p>All services in order <strong>${escapeHtml(order.orderNumber)}</strong> have been successfully provisioned and are now active.</p><p>Total paid: ${escapeHtml(formatCents(order.totalCents, order.currency))}.</p>`,
    });
  } else if (anyFailed && !anyInProgress) {
    await transitionOrderStatus({ orderId: order.id, to: "FAILED", reason: "One or more paid order items failed fulfilment." });
    await notifyOrderLifecycle({
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      email: order.user.email,
      type: "ORDER_FULFILMENT_FAILED",
      title: `Action required for order ${order.orderNumber}`,
      body: `One or more services in order ${order.orderNumber} could not be provisioned automatically. Your payment remains recorded and the failed fulfilment can be retried by support.`,
      emailSubject: `Action required for order ${order.orderNumber}`,
      emailHtml: `<p>One or more services in order <strong>${escapeHtml(order.orderNumber)}</strong> could not be provisioned automatically.</p><p>Your payment remains recorded. Our fulfilment workflow can retry the failed service.</p>`,
    });
  }
}

async function claimProvisioningItem(item: OrderItem): Promise<boolean> {
  if (item.provisioningStatus === "PROVISIONING") {
    const note = item.provisioningNote || "";
    const match = note.match(/^CLAIMED:(.+)$/);
    const claimedAt = match ? Date.parse(match[1] ?? "") : NaN;
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < STALE_CLAIM_MS) return false;
  }

  const result = await prisma.orderItem.updateMany({
    where: {
      id: item.id,
      provisioningStatus: item.provisioningStatus === "PROVISIONING" ? "PROVISIONING" : { in: ["PENDING", "FAILED"] },
    },
    data: { provisioningStatus: "PROVISIONING", provisioningNote: `CLAIMED:${new Date().toISOString()}` },
  });
  return result.count === 1;
}

async function provisionDomainRegistration(order: Order, item: OrderItem) {
  const domainName = item.description.split(" registration")[0]?.trim().toLowerCase();
  if (!domainName) throw new Error("Registration item is missing its domain name.");
  const tld = domainName.split(".").slice(1).join(".");
  const tldRecord = await prisma.tld.findUnique({ where: { extension: tld } });
  if (!tldRecord) throw new Error("The requested TLD is not configured.");

  const provider = getDomainProvider();
  const [availability] = await provider.checkAvailability([domainName]);
  if (!availability?.available) {
    const reconciled = await reconcileRegisteredDomain(provider, domainName);
    if (!reconciled) throw new Error("The domain is no longer available for registration.");
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: order.userId } });
  const phone = user.phone?.trim() || "";
  const country = user.country?.trim().toUpperCase() || "";
  if (!phone || !country) throw new Error("Complete domain contact information is required before registration.");

  let result;
  try {
    result = await provider.registerDomain({
      domain: domainName,
      years: item.years ?? 1,
      registrant: { firstName: user.firstName, lastName: user.lastName, email: user.email, phone, address1: "", city: "", zip: "", country },
      idempotencyKey: item.id,
    });
  } catch (error) {
    const reconciled = await reconcileRegisteredDomain(provider, domainName);
    if (!reconciled) throw error;
    result = { success: true, domain: domainName, expiresAt: reconciled.expiresAt };
  }

  if (!result.success) {
    const reconciled = await reconcileRegisteredDomain(provider, domainName);
    if (!reconciled) throw new Error(result.errorMessage || "Domain registration failed at the registrar.");
    result = { ...result, success: true, expiresAt: reconciled.expiresAt };
  }

  const domain = await prisma.domain.upsert({
    where: { name: domainName },
    create: {
      userId: order.userId,
      tldId: tldRecord.id,
      name: domainName,
      status: "ACTIVE",
      isPremium: Boolean(await prisma.premiumDomain.findUnique({ where: { domainName } }).then((p) => p?.status === "LISTED")),
      providerName: provider.name,
      providerOrderId: result.providerOrderId,
      registeredAt: new Date(),
      expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined,
      autoRenew: true,
      isLocked: true,
    },
    update: {
      status: "ACTIVE",
      registeredAt: new Date(),
      expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined,
      providerName: provider.name,
      providerOrderId: result.providerOrderId,
    },
  });

  await prisma.premiumDomain.updateMany({ where: { domainName, status: "LISTED" }, data: { status: "SOLD" } });
  await prisma.orderItem.updateMany({ where: { id: item.id, provisioningStatus: "PROVISIONING" }, data: { domainId: domain.id, provisioningStatus: "PROVISIONED", provisioningNote: "Domain registered and reconciled with registrar." } });
}

async function reconcileRegisteredDomain(provider: ReturnType<typeof getDomainProvider>, domainName: string) {
  try {
    const info = await provider.getDomainInfo(domainName);
    if (!info?.domain || !info.expiresAt) return null;
    return info;
  } catch {
    return null;
  }
}

async function provisionDomainRenewal(order: Order, item: OrderItem) {
  if (!item.domainId) throw new Error("Renewal item is missing a domain reference.");
  const domain = await prisma.domain.findUniqueOrThrow({ where: { id: item.domainId } });
  const provider = getDomainProvider();
  const result = await provider.renewDomain({ domain: domain.name, years: item.years ?? 1, idempotencyKey: item.id });
  if (!result.success) throw new Error(result.errorMessage || "Domain renewal failed at the registrar.");
  await prisma.domain.update({ where: { id: domain.id }, data: { expiresAt: result.newExpiresAt ? new Date(result.newExpiresAt) : domain.expiresAt, status: "ACTIVE" } });
  await prisma.orderItem.updateMany({ where: { id: item.id, provisioningStatus: "PROVISIONING" }, data: { provisioningStatus: "PROVISIONED", provisioningNote: "Domain renewal completed at registrar." } });
}

async function provisionDomainTransfer(order: Order, item: OrderItem) {
  if (!item.domainTransferId) throw new Error("Transfer item is missing a transfer reference.");
  const transfer = await prisma.domainTransfer.findUniqueOrThrow({ where: { id: item.domainTransferId } });
  if (transfer.status !== "AWAITING_PAYMENT") {
    await prisma.orderItem.updateMany({ where: { id: item.id, provisioningStatus: "PROVISIONING" }, data: { provisioningStatus: "PROVISIONED", provisioningNote: "Transfer already submitted or completed." } });
    return;
  }
  const provider = getDomainProvider();
  const authCode = decryptSecret(transfer.authCodeEncrypted);
  const result = await provider.transferDomain({ domain: transfer.domainName, authCode, idempotencyKey: item.id });
  if (!result.success) {
    await prisma.domainTransfer.update({ where: { id: transfer.id }, data: { status: "FAILED", failureReason: result.errorMessage } });
    throw new Error(result.errorMessage || "Domain transfer could not be submitted.");
  }
  await prisma.domainTransfer.update({ where: { id: transfer.id }, data: { status: "SUBMITTED", providerTransferId: result.providerTransferId } });
  await prisma.orderItem.updateMany({ where: { id: item.id, provisioningStatus: "PROVISIONING" }, data: { provisioningStatus: "PROVISIONED", provisioningNote: "Domain transfer submitted to registrar." } });
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" }[c] as string));
}
