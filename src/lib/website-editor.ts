import { prisma } from "@/lib/prisma";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { normalizeWebsiteContent, websiteContentSchema, type WebsiteContent } from "@/lib/ai/website-schema";

export async function getEditorState(projectId: string, userId: string) {
  const project = await getOwnedProjectOrThrow(projectId, userId);
  const versions = await prisma.websiteVersion.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, note: true, createdAt: true, content: true } });
  const stateRows = await prisma.$queryRaw<Array<{ last_saved_version_id: string | null; preview_version_id: string | null; published_version_id: string | null; version_seq: number }>>`
    SELECT "last_saved_version_id","preview_version_id","published_version_id","version_seq" FROM "website_editor_state" WHERE "project_id"=${projectId} LIMIT 1
  `;
  let content: WebsiteContent | null = null;
  if (project.content) {
    try { content = normalizeWebsiteContent(project.content); } catch { content = null; }
  }
  return { project, content, versions, state: stateRows[0] ?? { last_saved_version_id: versions[0]?.id ?? null, preview_version_id: null, published_version_id: null, version_seq: versions.length } };
}

export async function saveWebsiteDocument(params: { projectId: string; userId: string; content: unknown; note: string; baseVersionId?: string | null }) {
  const project = await getOwnedProjectOrThrow(params.projectId, params.userId);
  const content = websiteContentSchema.parse(params.content);
  return prisma.$transaction(async (tx) => {
    const state = await tx.$queryRaw<Array<{ last_saved_version_id: string | null; version_seq: number }>>`
      SELECT "last_saved_version_id","version_seq" FROM "website_editor_state" WHERE "project_id"=${project.id} FOR UPDATE
    `;
    const current = state[0];
    if (params.baseVersionId && current?.last_saved_version_id && params.baseVersionId !== current.last_saved_version_id) {
      const conflict = new Error("This website was changed in another editor session. Reload before saving so newer work is not overwritten.") as Error & { code?: string };
      conflict.code = "EDITOR_CONFLICT";
      throw conflict;
    }
    const version = await tx.websiteVersion.create({ data: { projectId: project.id, content: content as any, note: params.note.slice(0, 200) } });
    const updated = await tx.websiteProject.update({ where: { id: project.id }, data: { content: content as any, status: project.status === "DRAFT" || project.status === "GENERATING" ? "READY" : project.status } });
    await tx.$executeRaw`
      INSERT INTO "website_editor_state" ("project_id","last_saved_version_id","preview_version_id","version_seq")
      VALUES (${project.id},${version.id},${version.id},1)
      ON CONFLICT ("project_id") DO UPDATE SET "last_saved_version_id"=EXCLUDED."last_saved_version_id","preview_version_id"=EXCLUDED."preview_version_id","version_seq"="website_editor_state"."version_seq"+1,"updated_at"=CURRENT_TIMESTAMP
    `;
    return { project: updated, content, version };
  });
}

export async function restoreWebsiteVersion(params: { projectId: string; userId: string; versionId: string }) {
  const project = await getOwnedProjectOrThrow(params.projectId, params.userId);
  const version = await prisma.websiteVersion.findFirst({ where: { id: params.versionId, projectId: project.id } });
  if (!version) throw new Error("Website version not found.");
  const content = normalizeWebsiteContent(version.content);
  return saveWebsiteDocument({ projectId: project.id, userId: params.userId, content, note: `Restored from ${version.id}` });
}

export async function createPublishedSnapshot(params: { projectId: string; userId: string }) {
  const project = await getOwnedProjectOrThrow(params.projectId, params.userId);
  if (!project.content) throw new Error("Create and save website content before publishing.");
  const content = normalizeWebsiteContent(project.content);
  return prisma.$transaction(async (tx) => {
    const version = await tx.websiteVersion.create({ data: { projectId: project.id, content: content as any, note: "Published snapshot" } });
    const updated = await tx.websiteProject.update({ where: { id: project.id }, data: { status: "PUBLISHED", publishedAt: new Date(), content: content as any } });
    await tx.$executeRaw`
      INSERT INTO "website_editor_state" ("project_id","last_saved_version_id","preview_version_id","published_version_id","version_seq")
      VALUES (${project.id},${version.id},${version.id},${version.id},1)
      ON CONFLICT ("project_id") DO UPDATE SET "last_saved_version_id"=EXCLUDED."last_saved_version_id","preview_version_id"=EXCLUDED."preview_version_id","published_version_id"=EXCLUDED."published_version_id","version_seq"="website_editor_state"."version_seq"+1,"updated_at"=CURRENT_TIMESTAMP
    `;
    return { project: updated, version, content };
  });
}

export async function getPublishedSnapshot(projectId: string) {
  const rows = await prisma.$queryRaw<Array<{ published_version_id: string | null }>>`SELECT "published_version_id" FROM "website_editor_state" WHERE "project_id"=${projectId} LIMIT 1`;
  const versionId = rows[0]?.published_version_id;
  if (!versionId) return null;
  const version = await prisma.websiteVersion.findUnique({ where: { id: versionId } });
  if (!version) return null;
  return { version, content: normalizeWebsiteContent(version.content) };
}
