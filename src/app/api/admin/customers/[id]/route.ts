import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    await requireAdmin();
    const { id } = await params;
    const customer = await prisma.user.findUnique({
      where: { id },
      include: {
        domains: { include: { tld: true } },
        orders: { orderBy: { createdAt: "desc" }, take: 20 },
        invoices: { orderBy: { createdAt: "desc" }, take: 20 },
        supportTickets: true,
        credits: true,
      },
    });
    if (!customer) return jsonError("Customer not found.", 404);
    const { passwordHash, mfaSecret, ...safe } = customer;
    return jsonOk({ customer: safe });
  } catch (err) {
    return handleError(err);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: z.string().min(1).max(500) }),
  z.object({ action: z.literal("reactivate") }),
  z.object({ action: z.literal("issue_credit"), amountCents: z.number().int(), reason: z.string().min(1).max(300) }),
]);

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"]);
    const { id } = await params;
    const input = actionSchema.parse(await req.json());

    if (input.action === "suspend") {
      const customer = await prisma.user.update({ where: { id }, data: { isSuspended: true, suspendedReason: input.reason } });
      await prisma.session.deleteMany({ where: { userId: id } });
      await logAudit({ actorId: admin.id, action: "customer.suspended", resource: "user", resourceId: id, metadata: { reason: input.reason } });
      return jsonOk({ customer: { id: customer.id, isSuspended: customer.isSuspended } });
    }
    if (input.action === "reactivate") {
      const customer = await prisma.user.update({ where: { id }, data: { isSuspended: false, suspendedReason: null } });
      await logAudit({ actorId: admin.id, action: "customer.reactivated", resource: "user", resourceId: id });
      return jsonOk({ customer: { id: customer.id, isSuspended: customer.isSuspended } });
    }
    if (input.action === "issue_credit") {
      if (!["SUPER_ADMIN", "ADMIN", "FINANCE"].includes(admin.adminRole!)) return jsonError("You do not have permission to issue credits.", 403);
      const credit = await prisma.$transaction(async (tx) => {
        const c = await tx.customerCredit.create({ data: { userId: id, amountCents: input.amountCents, reason: input.reason, issuedByAdminId: admin.id } });
        await tx.ledgerEntry.create({ data: { userId: id, creditCents: input.amountCents > 0 ? input.amountCents : 0, debitCents: input.amountCents < 0 ? Math.abs(input.amountCents) : 0, source: "credit", reference: c.id, description: input.reason } });
        return c;
      });
      await logAudit({ actorId: admin.id, action: "customer.credit_issued", resource: "user", resourceId: id, metadata: { amountCents: input.amountCents, reason: input.reason } });
      return jsonOk({ credit });
    }
    return jsonError("Unsupported action.", 400);
  } catch (err) {
    return handleError(err);
  }
}
