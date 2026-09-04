import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { getOwnedDomainOrThrow } from "@/lib/domains";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ domainId: z.string() });

/**
 * Points a customer's domain at the platform by creating a CNAME record
 * through NameSilo — the same real DNS path used by the domain management
 * dashboard. This does NOT provision a TLS certificate for the custom
 * domain (that requires certificate automation this Phase does not include
 * — see docs/AI_BUILDER.md); the site remains reachable over HTTPS at its
 * platform URL (/sites/{slug}) regardless.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const project = await getOwnedProjectOrThrow(params.id, user.id);
    const { domainId } = schema.parse(await req.json());
    const domain = await getOwnedDomainOrThrow(domainId, user.id);

    const target = process.env.WEBSITE_HOSTING_TARGET || "sites.getsawa.app";
    const provider = getDomainProvider();

    try {
      await provider.createDnsRecord(domain.name, { type: "CNAME", host: "www", value: target, ttl: 3600 });
    } catch (err: any) {
      return jsonError(`Could not configure DNS for ${domain.name}: ${err.message}`, 502);
    }

    const updated = await prisma.websiteProject.update({
      where: { id: project.id },
      data: { domainId: domain.id, domainConnectionStatus: "CONFIGURING" },
    });

    await logAudit({
      actorId: user.id,
      action: "website.domain_connected",
      resource: "website_project",
      resourceId: project.id,
      metadata: { domain: domain.name },
    });

    return jsonOk({
      project: updated,
      instructions: `A CNAME record for www.${domain.name} now points to ${target}. DNS propagation can take up to 24-48 hours. A custom-domain TLS certificate is not automated in this version — the site remains available securely at /sites/${project.slug} in the meantime.`,
    });
  } catch (err) {
    return handleError(err);
  }
}
