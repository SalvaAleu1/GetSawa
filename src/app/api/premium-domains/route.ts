import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const listings = await prisma.premiumDomain.findMany({
      where: { status: "LISTED" },
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    });
    return jsonOk({ listings });
  } catch (err) {
    return handleError(err);
  }
}
