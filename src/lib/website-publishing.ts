import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { getPublishedSnapshot } from "@/lib/website-editor";
import { getCloudflareSecurityProvider } from "@/lib/providers/security/CloudflareSecurityProvider";
import { getCloudflareWorkerDomainsProvider } from "@/lib/providers/publishing/CloudflareWorkerDomainsProvider";
import { logAudit } from "@/lib/audit";

export async function publishDeployment(projectId: string, userId: string) {
  const project = await getOwnedProjectOrThrow(projectId, userId);
  const snapshot = await getPublishedSnapshot(project.id);
  if (!snapshot) throw new Error("Publish a saved website snapshot before creating a deployment.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "website_deployments" SET "status"='RETIRED' WHERE "project_id"=${project.id} AND "environment"='PRODUCTION' AND "status"='LIVE'`;
    const id = crypto.randomUUID();
    await tx.$executeRaw`
      INSERT INTO "website_deployments" ("id","project_id","version_id","environment","status","public_path")
      VALUES (${id},${project.id},${snapshot.version.id},'PRODUCTION','LIVE',${`/sites/${project.slug}`})
    `;
    return { id, versionId: snapshot.version.id, publicPath: `/sites/${project.slug}` };
  });
}

export async function rollbackDeployment(projectId: string, userId: string, deploymentId: string) {
  const project = await getOwnedProjectOrThrow(projectId, userId);
  const rows = await prisma.$queryRaw<Array<{ version_id: string }>>`
    SELECT "version_id" FROM "website_deployments" WHERE "id"=${deploymentId} AND "project_id"=${project.id} LIMIT 1
  `;
  const versionId = rows[0]?.version_id;
  if (!versionId) throw new Error("Deployment not found.");
  const version = await prisma.websiteVersion.findFirst({ where: { id: versionId, projectId: project.id } });
  if (!version) throw new Error("Deployment snapshot no longer exists.");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "website_deployments" SET "status"='RETIRED' WHERE "project_id"=${project.id} AND "environment"='PRODUCTION' AND "status"='LIVE'`;
    await tx.$executeRaw`UPDATE "website_deployments" SET "status"='LIVE',"activated_at"=CURRENT_TIMESTAMP WHERE "id"=${deploymentId}`;
    await tx.$executeRaw`UPDATE "website_editor_state" SET "published_version_id"=${versionId},"updated_at"=CURRENT_TIMESTAMP WHERE "project_id"=${project.id}`;
    await tx.websiteProject.update({ where: { id: project.id }, data: { content: version.content, status: "PUBLISHED", publishedAt: new Date() } });
  });
  await logAudit({ actorId: userId, action: "website.deployment_rolled_back", resource: "website_project", resourceId: project.id, metadata: { deploymentId, versionId } });
  return { deploymentId, versionId };
}

export async function connectWorkerDomain(params: { projectId: string; userId: string; domainId: string; hostname: string; replaceConflictingWebRecord: boolean }) {
  const project = await getOwnedProjectOrThrow(params.projectId, params.userId);
  if (project.status !== "PUBLISHED") throw new Error("Publish the website before attaching a custom domain.");
  const domain = await prisma.domain.findFirst({ where: { id: params.domainId, userId: params.userId, status: { in: ["ACTIVE", "EXPIRING"] } }, select: { id: true, name: true } });
  if (!domain) throw new Error("The selected domain is not an active domain in your account.");
  const hostname = params.hostname.trim().toLowerCase().replace(/\.$/, "");
  const apex = domain.name.toLowerCase();
  if (hostname !== apex && hostname !== `www.${apex}`) throw new Error("Custom website hostname must be the selected domain or its www hostname.");

  const zones = await prisma.$queryRaw<Array<{ zone_id: string; zone_status: string; cutover_status: string }>>`
    SELECT "zone_id","zone_status","cutover_status" FROM "cloudflare_zone_services" WHERE "domain_id"=${domain.id} LIMIT 1
  `;
  const zone = zones[0];
  if (!zone || zone.zone_status !== "active" || zone.cutover_status !== "ACTIVE") throw new Error("This domain must have an active Phase 17 Cloudflare zone before website hosting can be attached.");

  const cloudflare = getCloudflareSecurityProvider();
  const records = await cloudflare.listDnsRecords(zone.zone_id);
  const conflicts = records.filter((record) => record.name.toLowerCase() === hostname && ["A","AAAA","CNAME"].includes(record.type));
  if (conflicts.some((record) => record.type === "CNAME") && !params.replaceConflictingWebRecord) throw new Error("An existing CNAME blocks Cloudflare Worker Custom Domain creation. Confirm replacement after reviewing the record.");
  if (conflicts.length && params.replaceConflictingWebRecord) {
    for (const record of conflicts) await cloudflare.deleteDnsRecord(zone.zone_id, record.id);
  } else if (conflicts.length) {
    throw new Error("Existing apex/www web DNS records must be explicitly approved for replacement before attaching the Worker domain.");
  }

  const provider = getCloudflareWorkerDomainsProvider();
  if (!provider.isConfigured()) throw new Error("Cloudflare Worker custom-domain management is not configured.");
  const attached = await provider.attach(hostname, zone.zone_id, apex);
  const id = crypto.randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "website_custom_domains" SET "is_primary"=FALSE,"updated_at"=CURRENT_TIMESTAMP WHERE "project_id"=${project.id} AND "status"<>'DETACHED'`;
    await tx.$executeRaw`
      INSERT INTO "website_custom_domains" ("id","project_id","domain_id","hostname","zone_id","cloudflare_domain_id","certificate_id","status","is_primary","last_checked_at")
      VALUES (${id},${project.id},${domain.id},${hostname},${zone.zone_id},${attached.id},${attached.cert_id},'ACTIVE',TRUE,CURRENT_TIMESTAMP)
      ON CONFLICT ("hostname") DO UPDATE SET "project_id"=EXCLUDED."project_id","domain_id"=EXCLUDED."domain_id","zone_id"=EXCLUDED."zone_id","cloudflare_domain_id"=EXCLUDED."cloudflare_domain_id","certificate_id"=EXCLUDED."certificate_id","status"='ACTIVE',"is_primary"=TRUE,"last_error"=NULL,"last_checked_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP
    `;
    await tx.websiteProject.update({ where: { id: project.id }, data: { domainId: domain.id, domainConnectionStatus: "LIVE" } });
  });
  await logAudit({ actorId: params.userId, action: "website.custom_domain_attached", resource: "website_project", resourceId: project.id, metadata: { hostname, cloudflareDomainId: attached.id } });
  return { hostname, cloudflareDomainId: attached.id, certificateId: attached.cert_id };
}

export async function detachWorkerDomain(projectId: string, userId: string, hostname: string) {
  const project = await getOwnedProjectOrThrow(projectId, userId);
  const rows = await prisma.$queryRaw<Array<{ id: string; cloudflare_domain_id: string | null }>>`SELECT "id","cloudflare_domain_id" FROM "website_custom_domains" WHERE "project_id"=${project.id} AND "hostname"=${hostname.toLowerCase()} AND "status"<>'DETACHED' LIMIT 1`;
  const row = rows[0];
  if (!row) throw new Error("Custom domain is not attached to this website.");
  if (row.cloudflare_domain_id) await getCloudflareWorkerDomainsProvider().detach(row.cloudflare_domain_id);
  await prisma.$executeRaw`UPDATE "website_custom_domains" SET "status"='DETACHED',"is_primary"=FALSE,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${row.id}`;
  await prisma.websiteProject.update({ where: { id: project.id }, data: { domainConnectionStatus: "PENDING_DNS" } });
  return { detached: true };
}

export async function publishingState(projectId: string, userId: string) {
  const project = await getOwnedProjectOrThrow(projectId, userId);
  const [deployments, domains, redirects] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "website_deployments" WHERE "project_id"=${project.id} ORDER BY "created_at" DESC LIMIT 30`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "website_custom_domains" WHERE "project_id"=${project.id} ORDER BY "created_at" DESC`,
    prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM "website_redirects" WHERE "project_id"=${project.id} ORDER BY "source_path" ASC`,
  ]);
  return { project, deployments, domains, redirects };
}
