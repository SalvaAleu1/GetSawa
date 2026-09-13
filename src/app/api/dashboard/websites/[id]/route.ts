import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { websiteContentSchema } from "@/lib/ai/website-schema";
import { getEditorState, saveWebsiteDocument } from "@/lib/website-editor";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({ content: websiteContentSchema, note: z.string().max(200).optional(), baseVersionId: z.string().nullable().optional() });
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try { const user = await requireUser(); const { id } = await params; const editor = await getEditorState(id, user.id); return jsonOk({ ...editor, aiConfigured: Boolean(process.env.AI_API_KEY) }); }
  catch (err) { return handleError(err); }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser(); const { id } = await params; const input = updateSchema.parse(await req.json());
    const result = await saveWebsiteDocument({ projectId: id, userId: user.id, content: input.content, note: input.note || "Manual editor save", baseVersionId: input.baseVersionId });
    await logAudit({ actorId: user.id, action: "website.version_saved", resource: "website_project", resourceId: id, metadata: { versionId: result.version.id } });
    return jsonOk(result);
  } catch (err: any) {
    if (err?.code === "EDITOR_CONFLICT") return jsonError(err.message, 409, { code: "EDITOR_CONFLICT" });
    return handleError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try { const user = await requireUser(); const { id } = await params; const project = await getOwnedProjectOrThrow(id, user.id); await prisma.websiteProject.delete({ where: { id: project.id } }); await logAudit({ actorId: user.id, action: "website.deleted", resource: "website_project", resourceId: project.id }); return jsonOk({ success: true }); }
  catch (err) { return handleError(err); }
}
