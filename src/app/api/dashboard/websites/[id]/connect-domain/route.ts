import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
const schema = z.object({ domainId: z.string() }); type RouteContext = { params: Promise<{ id: string }> };
export async function POST(req: NextRequest, { params }: RouteContext) { try { const user = await requireUser(); const { id } = await params; const project = await getOwnedProjectOrThrow(id, user.id); const { domainId } = schema.parse(await req.json()); const domain = await getOwnedDomainOrThrow(domainId, user.id); const target = process.env.WEBSITE_HOSTING_TARGET || "sites.getsawa.app"; try { await getDomainProvider().createDnsRecord(domain.name, { type: "CNAME", host: "www", value: target, ttl: 3600 }); } catch (err: any) { return jsonError(`Could not configure DNS for ${domain.name}: ${err.message}`, 502); } const updated = await prisma.websiteProject.update({ where: { id: project.id }, data: { domainId: domain.id, domainConnectionStatus: "CONFIGURING" } }); await logAudit({ actorId: user.id, action: "website.domain_connected", resource: "website_project", resourceId: project.id, metadata: { domain: domain.name } }); return jsonOk({ project: updated, instructions: `A CNAME record for www.${domain.name} now points to ${target}. DNS propagation can take up to 24-48 hours. A custom-domain TLS certificate is not automated in this version — the site remains available securely at /sites/${project.slug} in the meantime.` }); } catch (err) { return handleError(err); } }
