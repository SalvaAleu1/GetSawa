import crypto from "crypto";
import type { Order, Payment, Refund } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface SettlementInput {
  payment: Pick<Payment, "id" | "userId" | "orderId" | "provider" | "amountCents" | "currency" | "providerCaptureId">;
  order: Pick<Order, "id" | "orderNumber" | "totalCents">;
  providerReference?: string | null;
  providerFeeCents?: number | null;
}

interface RefundSettlementInput {
  refund: Pick<Refund, "id" | "paymentId" | "amountCents" | "providerRefundId">;
  payment: Pick<Payment, "id" | "userId" | "orderId" | "provider" | "currency">;
  order: Pick<Order, "id" | "orderNumber">;
  providerFeeCents?: number | null;
}

function safeFee(value: number | null | undefined) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

/**
 * Records one successful payment exactly once even when confirmation arrives
 * through browser capture, webhook and reconciliation in different orders.
 */
export async function recordPaymentSettlement(input: SettlementInput) {
  const fee = safeFee(input.providerFeeCents);
  const providerReference = input.providerReference || input.payment.providerCaptureId || input.payment.id;
  const eventKey = `capture:${input.payment.provider}:${providerReference}`;
  const net = input.payment.amountCents - fee;

  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "finance_events"
        ("id","event_key","event_type","payment_id","order_id","provider","gross_cents","provider_fee_cents","net_cents","currency","provider_reference")
      VALUES
        (${crypto.randomUUID()},${eventKey},'PAYMENT_CAPTURED',${input.payment.id},${input.order.id},${input.payment.provider},${input.payment.amountCents},${fee},${net},${input.payment.currency.toUpperCase()},${providerReference})
      ON CONFLICT ("event_key") DO NOTHING
    `;
    if (Number(inserted) !== 1) return false;

    await tx.ledgerEntry.create({
      data: {
        userId: input.payment.userId,
        creditCents: input.payment.amountCents,
        source: "payment",
        reference: input.payment.id,
        description: `Payment received for order ${input.order.orderNumber}`,
      },
    });
    if (fee > 0) {
      await tx.ledgerEntry.create({
        data: {
          userId: input.payment.userId,
          debitCents: fee,
          source: "provider_fee",
          reference: input.payment.id,
          description: `${input.payment.provider} processing fee for order ${input.order.orderNumber}`,
        },
      });
    }
    return true;
  });
}

/** A completed refund is also idempotent by provider refund reference. */
export async function recordRefundSettlement(input: RefundSettlementInput) {
  const fee = safeFee(input.providerFeeCents);
  const providerReference = input.refund.providerRefundId || input.refund.id;
  const eventKey = `refund:${input.payment.provider}:${providerReference}`;
  const net = -(input.refund.amountCents + fee);

  return prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "finance_events"
        ("id","event_key","event_type","payment_id","order_id","refund_id","provider","gross_cents","provider_fee_cents","net_cents","currency","provider_reference")
      VALUES
        (${crypto.randomUUID()},${eventKey},'PAYMENT_REFUNDED',${input.payment.id},${input.order.id},${input.refund.id},${input.payment.provider},${input.refund.amountCents},${fee},${net},${input.payment.currency.toUpperCase()},${providerReference})
      ON CONFLICT ("event_key") DO NOTHING
    `;
    if (Number(inserted) !== 1) return false;

    await tx.ledgerEntry.create({
      data: {
        userId: input.payment.userId,
        debitCents: input.refund.amountCents,
        source: "refund",
        reference: input.refund.id,
        description: `Refund for order ${input.order.orderNumber}`,
      },
    });
    if (fee > 0) {
      await tx.ledgerEntry.create({
        data: {
          userId: input.payment.userId,
          debitCents: fee,
          source: "refund_fee",
          reference: input.refund.id,
          description: `${input.payment.provider} refund fee for order ${input.order.orderNumber}`,
        },
      });
    }
    return true;
  });
}

export async function recordPaymentDispute(params: {
  paymentId: string;
  orderId: string;
  provider: string;
  amountCents: number;
  currency: string;
  providerReference: string;
}) {
  const eventKey = `dispute:${params.provider}:${params.providerReference}`;
  const inserted = await prisma.$executeRaw`
    INSERT INTO "finance_events"
      ("id","event_key","event_type","payment_id","order_id","provider","gross_cents","provider_fee_cents","net_cents","currency","provider_reference")
    VALUES
      (${crypto.randomUUID()},${eventKey},'PAYMENT_DISPUTED',${params.paymentId},${params.orderId},${params.provider},${params.amountCents},0,${-params.amountCents},${params.currency.toUpperCase()},${params.providerReference})
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
