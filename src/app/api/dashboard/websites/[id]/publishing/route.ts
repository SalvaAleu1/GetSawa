import crypto from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { publishingState, rollbackDeployment } from "@/lib/website-publishing";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rollback"), deploymentId: z.string().min(1) }),
  z.object({ action: z.literal("redirect"), sourcePath: z.string().regex(/^\/[A-Za-z0-9/_-]*$/), targetPath: z.string().regex(/^\/[A-Za-z0-9/_-]*$/), statusCode: z.union([z.literal(301),z.literal(302),z.literal(307),z.literal(308)]).default(301) }),
]);

export async function GET(_req: NextRequest, { params }: Ctx) {
  try { const user = await requireUser(); const { id } = await params; return jsonOk(await publishingState(id, user.id)); } catch (error) { return handleError(error); }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(); const { id } = await params; const project = await getOwnedProjectOrThrow(id, user.id); const input = actionSchema.parse(await req.json());
    if (input.action === "rollback") return jsonOk(await rollbackDeployment(project.id, user.id, input.deploymentId));
    if (input.sourcePath === input.targetPath) throw new Error("A redirect cannot point to itself.");
    await prisma.$executeRaw`
      INSERT INTO "website_redirects" ("id","project_id","source_path","target_path","status_code","enabled")
      VALUES (${crypto.randomUUID()},${project.id},${input.sourcePath},${input.targetPath},${input.statusCode},TRUE)
      ON CONFLICT ("project_id","source_path") DO UPDATE SET "target_path"=EXCLUDED."target_path","status_code"=EXCLUDED."status_code","enabled"=TRUE,"updated_at"=CURRENT_TIMESTAMP
    `;
    await logAudit({ actorId: user.id, action: "website.redirect_saved", resource: "website_project", resourceId: project.id, metadata: input });
    return jsonOk({ saved: true });
  } catch (error) { return handleError(error); }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser(); const { id } = await params; const project = await getOwnedProjectOrThrow(id, user.id); const body = z.object({ redirectId: z.string().min(1) }).parse(await req.json());
    await prisma.$executeRaw`DELETE FROM "website_redirects" WHERE "id"=${body.redirectId} AND "project_id"=${project.id}`;
    return jsonOk({ deleted: true });
  } catch (error) { return handleError(error); }
}
