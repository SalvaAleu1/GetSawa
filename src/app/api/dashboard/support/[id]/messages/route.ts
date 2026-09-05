import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
const schema = z.object({ body: z.string().min(1).max(5000) }); type RouteContext = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: RouteContext) { try { const user = await requireUser(); const { id } = await params; const ticket = await prisma.supportTicket.findUnique({ where: { id } }); if (!ticket || ticket.userId !== user.id) return jsonError("Ticket not found.", 404); const { body } = schema.parse(await req.json()); const message = await prisma.supportMessage.create({ data: { ticketId: ticket.id, authorId: user.id, body } }); await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: ticket.status === "CLOSED" ? "OPEN" : "PENDING" } }); return jsonOk({ message }, 201); } catch (err) { return handleError(err); } }
