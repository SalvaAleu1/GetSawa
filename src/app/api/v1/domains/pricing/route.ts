import { NextRequest } from "next/server";
import { requireApiKey, ApiAuthError } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireApiKey(req, "domains:read");
    const tlds = await prisma.tld.findMany({ where: { isActive: true } });
    return jsonOk({
      results: tlds.map((t) => ({ extension: t.extension, ...computeTldPrice(t) })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return jsonError(err.message, err.status);
    return handleError(err);
  }
}
