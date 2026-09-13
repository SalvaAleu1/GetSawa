import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { jsonOk } from "@/lib/api";
import { withDeveloperApi } from "@/lib/developer-platform";

export async function GET(req: NextRequest) {
  return withDeveloperApi(req, "domains:read", "/api/v1/domains/pricing", async () => {
    const tlds = await prisma.tld.findMany({ where: { isActive: true }, orderBy: { extension: "asc" } });
    return jsonOk({ results: tlds.map((item) => ({ extension: item.extension, ...computeTldPrice(item) })) });
  });
}
