import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { prisma } from "@/lib/prisma";
import { websiteContentSchema } from "@/lib/ai/website-schema";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
const updateSchema = z.object({ content: websiteContentSchema, note: z.string().max(200).optional() }); type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, { params }: RouteContext) { try { const user = await requireUser(); const { id } = await params; const project = await getOwnedProjectOrThrow(id, user.id); return jsonOk({ project }); } catch (err) { return handleError(err); } }
export async function PUT(req: NextRequest, { params }: RouteContext) { try { const user = await requireUser(); const { id } = await params; const project = await getOwnedProjectOrThrow(id, user.id); const { content, note } = updateSchema.parse(await req.json()); const [updated] = await prisma.$transaction([prisma.websiteProject.update({ where: { id: project.id }, data: { content: content as any, status: project.status === "DRAFT" ? "READY" : project.status } }), prisma.websiteVersion.create({ data: { projectId: project.id, content: content as any, note } })]); await logAudit({ actorId: user.id, action: "website.updated", resource: "website_project", resourceId: project.id }); return jsonOk({ project: updated }); } catch (err) { return handleError(err); } }
export async function DELETE(_req: NextRequest, { params }: RouteContext) { try { const user = await requireUser(); const { id } = await params; const project = await getOwnedProjectOrThrow(id, user.id); await prisma.websiteProject.delete({ where: { id: project.id } }); await logAudit({ actorId: user.id, action: "website.deleted", resource: "website_project", resourceId: project.id }); return jsonOk({ success: true }); } catch (err) { return handleError(err); } }
