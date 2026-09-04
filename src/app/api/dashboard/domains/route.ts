import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const domains = await prisma.domain.findMany({
      where: { userId: user.id },
      include: { tld: true },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ domains });
  } catch (err) {
    return handleError(err);
  }
}
