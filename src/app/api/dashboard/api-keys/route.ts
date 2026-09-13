import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-keys";
import { DEVELOPER_API_SCOPES } from "@/lib/developer-platform";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(DEVELOPER_API_SCOPES)).min(1).max(DEVELOPER_API_SCOPES.length),
});

export async function GET() {
  try {
    const user = await requireUser();
    const keys = await prisma.apiClient.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, keyPrefix: true, scopes: true, rateLimit: true, isActive: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ keys, availableScopes: DEVELOPER_API_SCOPES });
  } catch (error) { return handleError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = createSchema.parse(await req.json());
    const activeKeys = await prisma.apiClient.count({ where: { userId: user.id, isActive: true } });
    if (activeKeys >= 10) return Response.json({ error: "Revoke an unused API key before creating another. A maximum of 10 active keys is allowed." }, { status: 409 });
    const { raw, hash, prefix } = generateApiKey();
    const client = await prisma.apiClient.create({ data: { userId: user.id, name: input.name, keyHash: hash, keyPrefix: prefix, scopes: Array.from(new Set(input.scopes)) } });
    await logAudit({ actorId: user.id, action: "api_key.created", resource: "api_client", resourceId: client.id, metadata: { scopes: client.scopes } });
    return jsonOk({ id: client.id, key: raw, prefix, scopes: client.scopes }, 201);
  } catch (error) { return handleError(error); }
}
