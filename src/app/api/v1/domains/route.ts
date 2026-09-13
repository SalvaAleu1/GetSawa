import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonOk } from "@/lib/api";
import { withDeveloperApi } from "@/lib/developer-platform";

export async function GET(req: NextRequest) {
  return withDeveloperApi(req, "domains:read", "/api/v1/domains", async ({ client }) => {
    const domains = await prisma.domain.findMany({
      where: { userId: client.userId },
      orderBy: [{ expiresAt: "asc" }, { name: "asc" }],
      take: 200,
      select: {
        id: true, name: true, status: true, isPremium: true, registeredAt: true, expiresAt: true,
        autoRenew: true, isLocked: true, privacyEnabled: true, nameservers: true, createdAt: true, updatedAt: true,
      },
    });
    return jsonOk({ data: domains });
  });
}
