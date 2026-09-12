import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getCustomerCreditBalance(userId: string): Promise<number> {
  const aggregate = await prisma.customerCredit.aggregate({ where: { userId }, _sum: { amountCents: true } });
  return aggregate._sum.amountCents ?? 0;
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
    // Lock the customer row so two finance adjustments cannot both read the
    // same balance and overdraw it concurrently.
    const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id"=${params.userId} FOR UPDATE`;
    if (!users[0]) throw new Error("Customer not found.");
    const aggregate = await tx.customerCredit.aggregate({ where: { userId: params.userId }, _sum: { amountCents: true } });
    const currentBalance = aggregate._sum.amountCents ?? 0;
    const nextBalance = currentBalance + params.amountCents;
    if (nextBalance < 0) throw new Error("This adjustment would make the customer credit balance negative.");

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
