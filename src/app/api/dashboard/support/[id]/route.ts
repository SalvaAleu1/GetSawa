import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      include: { messages: { where: { isInternalNote: false }, orderBy: { createdAt: "asc" } } },
    });
    if (!ticket || ticket.userId !== user.id) return jsonError("Ticket not found.", 404);
    return jsonOk({ ticket });
  } catch (err) {
    return handleError(err);
  }
}
