import { Order, OrderItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { decryptSecret } from "@/lib/crypto";
import { sendEmail, emailTemplates } from "@/lib/email";
import { formatCents } from "@/lib/money";

/**
 * Provisions every item on a PAYMENT_CONFIRMED order. Idempotent: items
 * already marked PROVISIONED are skipped, so re-running this (e.g. from a
 * retried webhook) never double-registers a domain or double-charges a
 * provider (spec section 147).
 */
export async function provisionOrder(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found during provisioning.`);
  if (!["PAYMENT_CONFIRMED", "PROVISIONING"].includes(order.status)) return;

  await prisma.order.update({ where: { id: order.id }, data: { status: "PROVISIONING" } });

  let anyFailed = false;

  for (const item of order.items) {
    if (item.provisioningStatus === "PROVISIONED") continue;

    try {
      if (!item.productId && !item.domainId && !item.domainTransferId && item.years) {
        // No product, no existing domain reference, no transfer reference,
        // but a term in years → this is a new domain registration.
        await provisionDomainRegistration(order, item);
      } else if (!item.productId && item.domainId && item.years) {
        // Existing domain reference + a term in years → renewal.
        await provisionDomainRenewal(order, item);
      } else if (item.domainTransferId) {
        await provisionDomainTransfer(order, item);
      } else {
        // Non-domain products (hosting, email, AI, SSL, add-ons) require a
        // Phase 2 provider integration. We never fake provisioning — mark
        // it pending and surface that clearly to the customer and admin.
        await prisma.orderItem.update({
          where: { id: item.id },
          data: {
            provisioningStatus: "FAILED",
            provisioningNote: "No provisioning provider is configured for this product yet. An administrator has been notified.",
          },
        });
        anyFailed = true;
      }
    } catch (err: any) {
      anyFailed = true;
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { provisioningStatus: "FAILED", provisioningNote: err.message?.slice(0, 500) },
      });
    }
  }

  const refreshed = await prisma.orderItem.findMany({ where: { orderId: order.id } });
  const allProvisioned = refreshed.every((i) => i.provisioningStatus === "PROVISIONED");

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: allProvisioned ? "ACTIVE" : anyFailed ? "PROVISIONING" : "PROVISIONING",
      provisioningError: anyFailed ? "One or more items could not be provisioned automatically. See order items for details." : null,
    },
  });

  if (allProvisioned) {
    const template = emailTemplates.orderConfirmation(order.orderNumber, formatCents(order.totalCents, order.currency));
    await sendEmail({ to: order.user.email, ...template });
  }
}

async function provisionDomainRegistration(order: Order, item: OrderItem) {
  const domainName = item.description.split(" registration")[0];
  const tld = domainName.split(".").slice(1).join(".");
  const tldRecord = await prisma.tld.findUnique({ where: { extension: tld } });
  if (!tldRecord) throw new Error(`Unknown TLD .${tld}`);

  const provider = getDomainProvider();

  // Re-check availability immediately before registering — time has passed
  // since checkout, and the domain must not be assumed available.
  const [availability] = await provider.checkAvailability([domainName]);
  if (!availability?.available) {
    throw new Error(`${domainName} is no longer available for registration.`);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: order.userId } });

  const result = await provider.registerDomain({
    domain: domainName,
    years: item.years ?? 1,
    registrant: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || "",
      address1: "",
      city: "",
      zip: "",
      country: user.country || "US",
    },
    idempotencyKey: item.id,
  });

  if (!result.success) {
    throw new Error(result.errorMessage || "Domain registration failed.");
  }

  const domain = await prisma.domain.upsert({
    where: { name: domainName },
    create: {
      userId: order.userId,
      tldId: tldRecord.id,
      name: domainName,
      status: "ACTIVE",
      isPremium: Boolean(await prisma.premiumDomain.findUnique({ where: { domainName } }).then((p) => p && p.status === "LISTED")),
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
    },
  });

  await prisma.premiumDomain.updateMany({
    where: { domainName, status: "LISTED" },
    data: { status: "SOLD" },
  });

  await prisma.orderItem.update({
    where: { id: item.id },
    data: { domainId: domain.id, provisioningStatus: "PROVISIONED" },
  });

  const template = emailTemplates.domainRegistered(domainName, domain.expiresAt?.toDateString() || "");
  await sendEmail({ to: user.email, ...template });
}

async function provisionDomainRenewal(order: Order, item: OrderItem) {
  if (!item.domainId) throw new Error("Renewal item is missing a domain reference.");
  const domain = await prisma.domain.findUniqueOrThrow({ where: { id: item.domainId } });
  const provider = getDomainProvider();

  const result = await provider.renewDomain({
    domain: domain.name,
    years: item.years ?? 1,
    idempotencyKey: item.id,
  });

  if (!result.success) {
    throw new Error(result.errorMessage || "Domain renewal failed.");
  }

  await prisma.domain.update({
    where: { id: domain.id },
    data: { expiresAt: result.newExpiresAt ? new Date(result.newExpiresAt) : domain.expiresAt, status: "ACTIVE" },
  });

  await prisma.orderItem.update({ where: { id: item.id }, data: { provisioningStatus: "PROVISIONED" } });
}

/**
 * Submits a domain transfer to the registry via NameSilo. Note that a
 * "successful" transfer submission does not mean the domain is transferred
 * yet — registry-side transfers are asynchronous and can take several days,
 * and may require approval at the losing registrar. This marks the order
 * item PROVISIONED once the transfer is successfully SUBMITTED (that's what
 * the customer paid for); the actual DomainTransfer.status is tracked
 * separately and surfaced on /dashboard/transfers.
 */
async function provisionDomainTransfer(order: Order, item: OrderItem) {
  if (!item.domainTransferId) throw new Error("Transfer item is missing a transfer reference.");
  const transfer = await prisma.domainTransfer.findUniqueOrThrow({ where: { id: item.domainTransferId } });

  if (transfer.status !== "AWAITING_PAYMENT") {
    // Already submitted (e.g. a retried webhook) — nothing further to do.
    await prisma.orderItem.update({ where: { id: item.id }, data: { provisioningStatus: "PROVISIONED" } });
    return;
  }

  const provider = getDomainProvider();
  const authCode = decryptSecret(transfer.authCodeEncrypted);

  const result = await provider.transferDomain({
    domain: transfer.domainName,
    authCode,
    idempotencyKey: item.id,
  });

  if (!result.success) {
    await prisma.domainTransfer.update({
      where: { id: transfer.id },
      data: { status: "FAILED", failureReason: result.errorMessage },
    });
    throw new Error(result.errorMessage || "Domain transfer could not be submitted.");
  }

  await prisma.domainTransfer.update({
    where: { id: transfer.id },
    data: { status: "SUBMITTED", providerTransferId: result.providerTransferId },
  });

  await prisma.orderItem.update({ where: { id: item.id }, data: { provisioningStatus: "PROVISIONED" } });
}
