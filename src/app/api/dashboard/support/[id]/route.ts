import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, { params }: RouteContext) { try { const user = await requireUser(); const { id } = await params; const ticket = await prisma.supportTicket.findUnique({ where: { id }, include: { messages: { where: { isInternalNote: false }, orderBy: { createdAt: "asc" } } } }); if (!ticket || ticket.userId !== user.id) return jsonError("Ticket not found.", 404); return jsonOk({ ticket }); } catch (err) { return handleError(err); } }
