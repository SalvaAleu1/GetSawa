import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  subject: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  message: z.string().min(1).max(5000),
});

export async function GET() {
  try {
    const user = await requireUser();
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });
    return jsonOk({ tickets });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = createSchema.parse(await req.json());

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject: input.subject,
        category: input.category,
        priority: input.priority,
        messages: { create: [{ authorId: user.id, body: input.message }] },
      },
    });

    await logAudit({ actorId: user.id, action: "support.ticket_created", resource: "support_ticket", resourceId: ticket.id });
    return jsonOk({ ticket }, 201);
  } catch (err) {
    return handleError(err);
  }
}
