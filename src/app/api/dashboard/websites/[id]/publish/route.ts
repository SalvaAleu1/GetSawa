import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { createPublishedSnapshot } from "@/lib/website-editor";
import { publishDeployment } from "@/lib/website-publishing";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ publish: z.boolean() });
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const project = await getOwnedProjectOrThrow(id, user.id);
    const { publish } = schema.parse(await req.json());
    if (publish) {
      if (!project.content) return jsonError("Create and save website content before publishing.", 400);
      const snapshot = await createPublishedSnapshot({ projectId: id, userId: user.id });
      const deployment = await publishDeployment(id, user.id);
      await logAudit({ actorId: user.id, action: "website.production_deployed", resource: "website_project", resourceId: id, metadata: { versionId: snapshot.version.id, deploymentId: deployment.id } });
      return jsonOk({ project: snapshot.project, publishedVersionId: snapshot.version.id, deployment, publicUrl: `${process.env.APP_URL}/sites/${snapshot.project.slug}` });
    }
    const updated = await prisma.websiteProject.update({ where: { id: project.id }, data: { status: "UNPUBLISHED" } });
    await prisma.$executeRaw`UPDATE "website_deployments" SET "status"='RETIRED' WHERE "project_id"=${project.id} AND "environment"='PRODUCTION' AND "status"='LIVE'`;
    await logAudit({ actorId: user.id, action: "website.unpublished", resource: "website_project", resourceId: id });
    return jsonOk({ project: updated, publicUrl: null });
  } catch (error) {
    return handleError(error);
  }
}
