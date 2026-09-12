import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { generateInvoiceNumber } from "@/lib/pricing";

function safeFee(value: number | null | undefined) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

async function ensurePaidInvoice(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true, invoice: true } });
  if (!order) throw new Error("Order not found while finalizing payment accounting.");
  if (order.invoice) {
    if (order.invoice.status === "REFUNDED") return;
    if (order.invoice.status !== "PAID") {
      await prisma.invoice.update({ where: { id: order.invoice.id }, data: { status: "PAID", paidAt: order.invoice.paidAt ?? new Date() } });
    }
    return;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const count = await prisma.invoice.count();
    try {
      await prisma.invoice.create({
        data: {
          invoiceNumber: generateInvoiceNumber(count + 1 + attempt),
          orderId: order.id,
          userId: order.userId,
          subtotalCents: order.subtotalCents,
          discountCents: order.discountCents,
          taxCents: order.taxCents,
          totalCents: order.totalCents,
          currency: order.currency,
          status: "PAID",
          paidAt: new Date(),
          billingName: `${order.user.firstName} ${order.user.lastName}`,
          billingEmail: order.user.email,
          billingCountry: order.user.country ?? undefined,
        },
      });
      return;
    } catch (error: any) {
      if (error?.code === "P2002" && attempt < 3) continue;
      throw error;
    }
  }
}

/**
 * Records one successful payment exactly once even when confirmation arrives
 * through browser capture, webhook and reconciliation in different orders.
 */
export async function recordPaymentSettlement(params: {
  paymentId: string;
  providerReference?: string | null;
  providerFeeCents?: number | null;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId }, include: { order: true } });
  if (!payment) throw new Error("Payment not found while recording settlement.");
  if (!["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) throw new Error("Only captured payments can be recorded as settled.");

  await ensurePaidInvoice(payment.orderId);

  const fee = safeFee(params.providerFeeCents);
  const providerReference = params.providerReference || payment.providerCaptureId || payment.id;
  const eventKey = `capture:${payment.provider}:${providerReference}`;
  const net = payment.amountCents - fee;

  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "finance_events"
        ("id","event_key","event_type","payment_id","order_id","provider","gross_cents","provider_fee_cents","net_cents","currency","provider_reference")
      VALUES
        (${crypto.randomUUID()},${eventKey},'PAYMENT_CAPTURED',${payment.id},${payment.orderId},${payment.provider},${payment.amountCents},${fee},${net},${payment.currency.toUpperCase()},${providerReference})
      ON CONFLICT ("event_key") DO NOTHING
    `;
    if (Number(inserted) !== 1) return false;

    await tx.ledgerEntry.create({
      data: {
        userId: payment.userId,
        creditCents: payment.amountCents,
        source: "payment",
        reference: payment.id,
        description: `Payment received for order ${payment.order.orderNumber}`,
      },
    });
    if (fee > 0) {
      await tx.ledgerEntry.create({
        data: {
          userId: payment.userId,
          debitCents: fee,
          source: "provider_fee",
          reference: payment.id,
          description: `${payment.provider} processing fee for order ${payment.order.orderNumber}`,
        },
      });
    }
    return true;
  });
}

export async function recordRefundSettlement(params: {
  refundId: string;
  providerFeeCents?: number | null;
}) {
  const refund = await prisma.refund.findUnique({ where: { id: params.refundId }, include: { payment: { include: { order: true } } } });
  if (!refund) throw new Error("Refund not found while recording settlement.");
  if (refund.status !== "COMPLETED") throw new Error("Only completed refunds can be recorded as settled.");
  const payment = refund.payment;
  const fee = safeFee(params.providerFeeCents);
  const providerReference = refund.providerRefundId || refund.id;
  const eventKey = `refund:${payment.provider}:${providerReference}`;
  const net = -(refund.amountCents + fee);

  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "finance_events"
        ("id","event_key","event_type","payment_id","order_id","refund_id","provider","gross_cents","provider_fee_cents","net_cents","currency","provider_reference")
      VALUES
        (${crypto.randomUUID()},${eventKey},'PAYMENT_REFUNDED',${payment.id},${payment.orderId},${refund.id},${payment.provider},${refund.amountCents},${fee},${net},${payment.currency.toUpperCase()},${providerReference})
      ON CONFLICT ("event_key") DO NOTHING
    `;
    if (Number(inserted) !== 1) return false;

    await tx.ledgerEntry.create({
      data: {
        userId: payment.userId,
        debitCents: refund.amountCents,
        source: "refund",
        reference: refund.id,
        description: `Refund for order ${payment.order.orderNumber}`,
      },
    });
    if (fee > 0) {
      await tx.ledgerEntry.create({
        data: {
          userId: payment.userId,
          debitCents: fee,
          source: "refund_fee",
          reference: refund.id,
          description: `${payment.provider} refund fee for order ${payment.order.orderNumber}`,
        },
      });
    }
    return true;
  });
}

export async function recordPaymentDispute(params: {
  paymentId: string;
  providerReference: string;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
  if (!payment) throw new Error("Payment not found while recording dispute.");
  const eventKey = `dispute:${payment.provider}:${params.providerReference}`;
  const inserted = await prisma.$executeRaw`
    INSERT INTO "finance_events"
      ("id","event_key","event_type","payment_id","order_id","provider","gross_cents","provider_fee_cents","net_cents","currency","provider_reference")
    VALUES
      (${crypto.randomUUID()},${eventKey},'PAYMENT_DISPUTED',${payment.id},${payment.orderId},${payment.provider},${payment.amountCents},0,0,${payment.currency.toUpperCase()},${params.providerReference})
    ON CONFLICT ("event_key") DO NOTHING
  `;
  return Number(inserted) === 1;
}

export async function getFinanceSummary(params: { from: Date; to: Date }) {
  const rows = await prisma.$queryRaw<Array<{
    event_type: string;
    gross_cents: bigint | number;
    provider_fee_cents: bigint | number;
    net_cents: bigint | number;
  }>>`
    SELECT "event_type", SUM("gross_cents") AS "gross_cents", SUM("provider_fee_cents") AS "provider_fee_cents", SUM("net_cents") AS "net_cents"
    FROM "finance_events"
    WHERE "created_at">=${params.from} AND "created_at"<${params.to}
    GROUP BY "event_type"
  `;
  return rows.map((row) => ({
    eventType: row.event_type,
    grossCents: Number(row.gross_cents),
    providerFeeCents: Number(row.provider_fee_cents),
    netCents: Number(row.net_cents),
  }));
}
