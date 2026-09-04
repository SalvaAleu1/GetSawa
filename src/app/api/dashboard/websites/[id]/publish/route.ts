import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ publish: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const project = await getOwnedProjectOrThrow(params.id, user.id);
    const { publish } = schema.parse(await req.json());

    if (publish && !project.content) {
      return jsonError("Generate or write your site's content before publishing.", 400);
    }

    const updated = await prisma.websiteProject.update({
      where: { id: project.id },
      data: {
        status: publish ? "PUBLISHED" : "UNPUBLISHED",
        publishedAt: publish ? new Date() : project.publishedAt,
      },
    });

    await logAudit({
      actorId: user.id,
      action: publish ? "website.published" : "website.unpublished",
      resource: "website_project",
      resourceId: project.id,
    });

    return jsonOk({ project: updated, publicUrl: publish ? `${process.env.APP_URL}/sites/${updated.slug}` : null });
  } catch (err) {
    return handleError(err);
  }
}
