import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { connectWorkerDomain, detachWorkerDomain } from "@/lib/website-publishing";
import { jsonOk, handleError } from "@/lib/api";

const schema = z.object({
  domainId: z.string().min(1),
  hostname: z.string().min(3).max(253),
  replaceConflictingWebRecord: z.boolean().default(false),
});
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = schema.parse(await req.json());
    const result = await connectWorkerDomain({ projectId: id, userId: user.id, ...input });
    return jsonOk({ ...result, tls: "Cloudflare-managed certificate requested with Worker Custom Domain." });
  } catch (error) { return handleError(error); }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = z.object({ hostname: z.string().min(3) }).parse(await req.json());
    return jsonOk(await detachWorkerDomain(id, user.id, body.hostname));
  } catch (error) { return handleError(error); }
}
