import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      include: { messages: { orderBy: { createdAt: "asc" } }, user: { select: { email: true, firstName: true, lastName: true } } },
    });
    if (!ticket) return jsonError("Ticket not found.", 404);
    return jsonOk({ ticket });
  } catch (err) {
    return handleError(err);
  }
}

const schema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assignedTo: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
    const input = schema.parse(await req.json());
    const ticket = await prisma.supportTicket.update({ where: { id: params.id }, data: input });
    await logAudit({ actorId: admin.id, action: "support.ticket_updated", resource: "support_ticket", resourceId: ticket.id, metadata: input });
    return jsonOk({ ticket });
  } catch (err) {
    return handleError(err);
  }
}
