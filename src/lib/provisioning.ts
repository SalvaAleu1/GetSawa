import { Order, OrderItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { decryptSecret } from "@/lib/crypto";
import { sendEmail, emailTemplates } from "@/lib/email";
import { formatCents } from "@/lib/money";

const STALE_CLAIM_MS = 15 * 60 * 1000;

/**
 * Provisions every item on a PAYMENT_CONFIRMED order.
 *
 * Each item is atomically claimed before any external provider call. This is
 * important because PayPal's capture response and webhook can legitimately
 * arrive at the same time. A crashed worker leaves a timestamped claim that
 * can be recovered after a bounded timeout rather than permanently wedging
 * the order.
 */
export async function provisionOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true, user: true } });
  if (!order) throw new Error(`Order ${orderId} not found during provisioning.`);
  if (!["PAYMENT_CONFIRMED", "PROVISIONING"].includes(order.status)) return;

  await prisma.order.updateMany({
    where: { id: order.id, status: { in: ["PAYMENT_CONFIRMED", "PROVISIONING"] } },
    data: { status: "PROVISIONING" },
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
        throw new Error("No provider is configured for this product. An administrator must configure provisioning before it can be fulfilled.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown provisioning error.";
      await prisma.orderItem.updateMany({
        where: { id: item.id, provisioningStatus: "PROVISIONING" },
        data: { provisioningStatus: "FAILED", provisioningNote: message.slice(0, 500) },
      });
    }
  }

  const refreshed = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const allProvisioned = refreshed.length > 0 && refreshed.every((i) => i.provisioningStatus === "PROVISIONED");
  const anyFailed = refreshed.some((i) => i.provisioningStatus === "FAILED");
  const anyInProgress = refreshed.some((i) => i.provisioningStatus === "PROVISIONING");

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: allProvisioned ? "ACTIVE" : "PROVISIONING",
      provisioningError: anyFailed
        ? "One or more items could not be provisioned automatically. Failed items are retryable from the order workflow."
        : anyInProgress
          ? null
          : null,
    },
  });

  // Email delivery must never turn a successfully provisioned order into a
  // payment/provider failure. Delivery can be retried independently.
  if (allProvisioned) {
    try {
      const template = emailTemplates.orderConfirmation(order.orderNumber, formatCents(order.totalCents, order.currency));
      await sendEmail({ to: order.user.email, ...template });
    } catch {
      // Do not throw after the financial/provisioning state is committed.
    }
  }
}

async function claimProvisioningItem(item: OrderItem): Promise<boolean> {
  if (item.provisioningStatus === "PROVISIONING") {
    const note = item.provisioningNote || "";
    const match = note.match(/^CLAIMED:(.+)$/);
    const claimedAt = match ? Date.parse(match[1]) : NaN;
    if (Number.isFinite(claimedAt) && Date.now() - claimedAt < STALE_CLAIM_MS) return false;
  }

  const result = await prisma.orderItem.updateMany({
    where: {
      id: item.id,
      provisioningStatus: item.provisioningStatus === "PROVISIONING"
        ? "PROVISIONING"
        : { in: ["PENDING", "FAILED"] },
    },
    data: { provisioningStatus: "PROVISIONING", provisioningNote: `CLAIMED:${new Date().toISOString()}` },
  });
  return result.count === 1;
}

async function provisionDomainRegistration(order: Order, item: OrderItem) {
  const domainName = item.description.split(" registration")[0]?.trim();
  if (!domainName) throw new Error("Registration item is missing its domain name.");
  const tld = domainName.split(".").slice(1).join(".");
  const tldRecord = await prisma.tld.findUnique({ where: { extension: tld } });
  if (!tldRecord) throw new Error(`Unknown TLD .${tld}`);

  const provider = getDomainProvider();
  const [availability] = await provider.checkAvailability([domainName]);
  if (!availability?.available) {
    // A previous registration attempt may have succeeded even if our request
    // timed out. Reconcile with the registrar before declaring failure.
    const reconciled = await reconcileRegisteredDomain(provider, domainName);
    if (!reconciled) throw new Error(`${domainName} is no longer available for registration.`);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: order.userId } });
  const phone = user.phone?.trim() || "";
  const country = user.country?.trim().toUpperCase() || "";
  if (!phone || !country) throw new Error("Complete domain contact information is required before registration. Add a valid phone number and country to your profile.");

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
    // Provider clients may normalize HTTP/API failures into {success:false}.
    // Reconcile once before marking the paid order as failed.
    const reconciled = await reconcileRegisteredDomain(provider, domainName);
    if (!reconciled) throw new Error(result.errorMessage || "Domain registration failed at the registrar.");
    result = { ...result, success: true, expiresAt: reconciled.expiresAt };
  }

  const domain = await prisma.domain.upsert({
    where: { name: domainName },
    create: { userId: order.userId, tldId: tldRecord.id, name: domainName, status: "ACTIVE", isPremium: Boolean(await prisma.premiumDomain.findUnique({ where: { domainName } }).then((p) => p?.status === "LISTED")), providerName: provider.name, providerOrderId: result.providerOrderId, registeredAt: new Date(), expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined, autoRenew: true, isLocked: true },
    update: { status: "ACTIVE", registeredAt: new Date(), expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined, providerName: provider.name, providerOrderId: result.providerOrderId },
  });

  await prisma.premiumDomain.updateMany({ where: { domainName, status: "LISTED" }, data: { status: "SOLD" } });
  await prisma.orderItem.updateMany({ where: { id: item.id, provisioningStatus: "PROVISIONING" }, data: { domainId: domain.id, provisioningStatus: "PROVISIONED", provisioningNote: "Domain registered and reconciled with registrar." } });
  try {
    const template = emailTemplates.domainRegistered(domainName, domain.expiresAt?.toDateString() || "");
    await sendEmail({ to: user.email, ...template });
  } catch {
    // Email is non-critical to provisioning.
  }
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
  if (transfer.status !== "AWAITING_PAYMENT") { await prisma.orderItem.updateMany({ where: { id: item.id, provisioningStatus: "PROVISIONING" }, data: { provisioningStatus: "PROVISIONED", provisioningNote: "Transfer already submitted or completed." } }); return; }
  const provider = getDomainProvider();
  const authCode = decryptSecret(transfer.authCodeEncrypted);
  const result = await provider.transferDomain({ domain: transfer.domainName, authCode, idempotencyKey: item.id });
  if (!result.success) { await prisma.domainTransfer.update({ where: { id: transfer.id }, data: { status: "FAILED", failureReason: result.errorMessage } }); throw new Error(result.errorMessage || "Domain transfer could not be submitted."); }
  await prisma.domainTransfer.update({ where: { id: transfer.id }, data: { status: "SUBMITTED", providerTransferId: result.providerTransferId } });
  await prisma.orderItem.updateMany({ where: { id: item.id, provisioningStatus: "PROVISIONING" }, data: { provisioningStatus: "PROVISIONED", provisioningNote: "Domain transfer submitted to registrar." } });
}
