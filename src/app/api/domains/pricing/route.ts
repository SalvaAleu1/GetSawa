import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const tlds = await prisma.tld.findMany({ where: { isActive: true }, orderBy: [{ isFeatured: "desc" }, { extension: "asc" }] });
    const results = tlds.map((t) => ({
      extension: t.extension,
      featured: t.isFeatured,
      ...computeTldPrice(t),
    }));
    return jsonOk({ results });
  } catch (err) {
    return handleError(err);
  }
}
