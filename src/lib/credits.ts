import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const CREDIT_RESERVATION_MS = 15 * 60 * 1000;

type CreditApplicationRow = {
  id: string;
  order_id: string;
  user_id: string;
  amount_cents: number;
  status: "RESERVED" | "APPLIED" | "RELEASED" | "REFUNDED";
  credit_adjustment_id: string | null;
  refund_credit_id: string | null;
  expires_at: Date;
};

async function reservedCreditCentsTx(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ reserved_cents: bigint | number }>>`
    SELECT COALESCE(SUM("amount_cents"),0) AS "reserved_cents"
    FROM "order_credit_applications"
    WHERE "user_id"=${userId} AND "status"='RESERVED' AND "expires_at">CURRENT_TIMESTAMP
  `;
  return Number(rows[0]?.reserved_cents ?? 0);
}

export async function getCustomerCreditBalance(userId: string): Promise<number> {
  const aggregate = await prisma.customerCredit.aggregate({ where: { userId }, _sum: { amountCents: true } });
  return aggregate._sum.amountCents ?? 0;
}

export async function getAvailableCustomerCredit(userId: string): Promise<number> {
  const [aggregate, rows] = await Promise.all([
    prisma.customerCredit.aggregate({ where: { userId }, _sum: { amountCents: true } }),
    prisma.$queryRaw<Array<{ reserved_cents: bigint | number }>>`
      SELECT COALESCE(SUM("amount_cents"),0) AS "reserved_cents"
      FROM "order_credit_applications"
      WHERE "user_id"=${userId} AND "status"='RESERVED' AND "expires_at">CURRENT_TIMESTAMP
    `,
  ]);
  const balance = aggregate._sum.amountCents ?? 0;
  const reserved = Number(rows[0]?.reserved_cents ?? 0);
  return Math.max(0, balance - reserved);
}

export async function reserveOrderCreditTx(
  tx: Prisma.TransactionClient,
  params: { userId: string; orderId: string; maximumCents: number },
): Promise<number> {
  if (!Number.isSafeInteger(params.maximumCents) || params.maximumCents <= 0) return 0;

  const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id"=${params.userId} FOR UPDATE`;
  if (!users[0]) throw new Error("Customer not found while reserving account credit.");

  await tx.$executeRaw`
    UPDATE "order_credit_applications"
    SET "status"='RELEASED',"updated_at"=CURRENT_TIMESTAMP
    WHERE "user_id"=${params.userId} AND "status"='RESERVED' AND "expires_at"<=CURRENT_TIMESTAMP
  `;

  const aggregate = await tx.customerCredit.aggregate({ where: { userId: params.userId }, _sum: { amountCents: true } });
  const balance = aggregate._sum.amountCents ?? 0;
  const reserved = await reservedCreditCentsTx(tx, params.userId);
  const available = Math.max(0, balance - reserved);
  const amount = Math.min(available, params.maximumCents);
  if (amount <= 0) return 0;

  const expiresAt = new Date(Date.now() + CREDIT_RESERVATION_MS);
  await tx.$executeRaw`
    INSERT INTO "order_credit_applications" ("id","order_id","user_id","amount_cents","status","expires_at")
    VALUES (${crypto.randomUUID()},${params.orderId},${params.userId},${amount},'RESERVED',${expiresAt})
  `;
  return amount;
}

export async function getOrderCreditApplication(orderId: string): Promise<CreditApplicationRow | null> {
  const rows = await prisma.$queryRaw<CreditApplicationRow[]>`
    SELECT * FROM "order_credit_applications" WHERE "order_id"=${orderId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function assertOrderCreditReservation(orderId: string, userId: string): Promise<number> {
  const row = await getOrderCreditApplication(orderId);
  if (!row) return 0;
  if (row.user_id !== userId) throw new Error("Account credit reservation does not belong to this customer.");
  if (row.status === "APPLIED") return row.amount_cents;
  if (row.status !== "RESERVED" || row.expires_at.getTime() <= Date.now()) {
    await releaseOrderCredit(orderId);
    throw new Error("The account credit reservation expired. Restart checkout to refresh your balance.");
  }
  return row.amount_cents;
}

export async function releaseOrderCredit(orderId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "order_credit_applications"
    SET "status"='RELEASED',"updated_at"=CURRENT_TIMESTAMP
    WHERE "order_id"=${orderId} AND "status"='RESERVED'
  `;
}

export async function finalizeOrderCredit(orderId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<CreditApplicationRow[]>`
      SELECT * FROM "order_credit_applications" WHERE "order_id"=${orderId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return 0;
    if (row.status === "APPLIED") return row.amount_cents;
    if (row.status === "REFUNDED") throw new Error("Refunded account credit cannot be applied again.");
    if (row.status !== "RESERVED" || row.expires_at.getTime() <= Date.now()) {
      await tx.$executeRaw`UPDATE "order_credit_applications" SET "status"='RELEASED',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;
      throw new Error("The account credit reservation expired before payment confirmation.");
    }

    const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id"=${row.user_id} FOR UPDATE`;
    if (!users[0]) throw new Error("Customer not found while applying account credit.");
    const aggregate = await tx.customerCredit.aggregate({ where: { userId: row.user_id }, _sum: { amountCents: true } });
    const balance = aggregate._sum.amountCents ?? 0;
    if (balance < row.amount_cents) throw new Error("Account credit balance is no longer sufficient for this order.");

    const credit = await tx.customerCredit.create({
      data: { userId: row.user_id, amountCents: -row.amount_cents, reason: `Applied to order ${orderId}` },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: row.user_id,
        debitCents: row.amount_cents,
        source: "credit_payment",
        reference: credit.id,
        description: `Account credit applied to order ${orderId}`,
      },
    });
    await tx.$executeRaw`
      UPDATE "order_credit_applications"
      SET "status"='APPLIED',"credit_adjustment_id"=${credit.id},"updated_at"=CURRENT_TIMESTAMP
      WHERE "id"=${row.id}
    `;
    return row.amount_cents;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function restoreOrderCredit(orderId: string): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<CreditApplicationRow[]>`
      SELECT * FROM "order_credit_applications" WHERE "order_id"=${orderId} FOR UPDATE
    `;
    const row = rows[0];
    if (!row || row.status === "REFUNDED" || row.status === "RELEASED") return 0;
    if (row.status !== "APPLIED") return 0;

    const credit = await tx.customerCredit.create({
      data: { userId: row.user_id, amountCents: row.amount_cents, reason: `Credit restored for refunded order ${orderId}` },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: row.user_id,
        creditCents: row.amount_cents,
        source: "credit_refund",
        reference: credit.id,
        description: `Account credit restored for refunded order ${orderId}`,
      },
    });
    await tx.$executeRaw`
      UPDATE "order_credit_applications"
      SET "status"='REFUNDED',"refund_credit_id"=${credit.id},"updated_at"=CURRENT_TIMESTAMP
      WHERE "id"=${row.id}
    `;
    return row.amount_cents;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function adjustCustomerCredit(params: {
  userId: string;
  amountCents: number;
  reason: string;
  adminId: string;
}) {
  if (!Number.isSafeInteger(params.amountCents) || params.amountCents === 0) throw new Error("Credit adjustment must be a non-zero whole-cent amount.");
  const reason = params.reason.trim();
  if (!reason) throw new Error("A credit adjustment reason is required.");

  return prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id"=${params.userId} FOR UPDATE`;
    if (!users[0]) throw new Error("Customer not found.");
    const aggregate = await tx.customerCredit.aggregate({ where: { userId: params.userId }, _sum: { amountCents: true } });
    const currentBalance = aggregate._sum.amountCents ?? 0;
    const reserved = await reservedCreditCentsTx(tx, params.userId);
    const nextBalance = currentBalance + params.amountCents;
    if (nextBalance < reserved) throw new Error("This adjustment would consume credit already reserved for a pending checkout.");

    const credit = await tx.customerCredit.create({
      data: { userId: params.userId, amountCents: params.amountCents, reason, issuedByAdminId: params.adminId },
    });
    await tx.ledgerEntry.create({
      data: {
        userId: params.userId,
        creditCents: params.amountCents > 0 ? params.amountCents : 0,
        debitCents: params.amountCents < 0 ? Math.abs(params.amountCents) : 0,
        source: "credit",
        reference: credit.id,
        description: reason,
      },
    });
    return { credit, previousBalanceCents: currentBalance, balanceCents: nextBalance };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
