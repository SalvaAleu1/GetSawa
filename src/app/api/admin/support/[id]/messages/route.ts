import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

const schema = z.object({ body: z.string().min(1).max(5000), isInternalNote: z.boolean().default(false) });
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "SUPPORT"]);
    const { id } = await params;
    const { body, isInternalNote } = schema.parse(await req.json());
    const message = await prisma.supportMessage.create({ data: { ticketId: id, authorId: admin.id, body, isInternalNote } });
    if (!isInternalNote) await prisma.supportTicket.update({ where: { id }, data: { status: "PENDING" } });
    return jsonOk({ message }, 201);
  } catch (err) { return handleError(err); }
}
