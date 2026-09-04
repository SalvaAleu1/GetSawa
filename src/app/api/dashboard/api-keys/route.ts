import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-keys";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(["domains:read"])).min(1).default(["domains:read"]),
});

export async function GET() {
  try {
    const user = await requireUser();
    const keys = await prisma.apiClient.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, keyPrefix: true, scopes: true, isActive: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ keys });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = createSchema.parse(await req.json());
    const { raw, hash, prefix } = generateApiKey();

    const client = await prisma.apiClient.create({
      data: { userId: user.id, name: input.name, keyHash: hash, keyPrefix: prefix, scopes: input.scopes },
    });

    await logAudit({ actorId: user.id, action: "api_key.created", resource: "api_client", resourceId: client.id });

    // The raw key is returned exactly once — it is never retrievable again
    // (only keyHash is stored), same principle as a password.
    return jsonOk({ id: client.id, key: raw, prefix }, 201);
  } catch (err) {
    return handleError(err);
  }
}
