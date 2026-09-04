import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const transfers = await prisma.domainTransfer.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        domainName: true,
        status: true,
        failureReason: true,
        providerTransferId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return jsonOk({ transfers });
  } catch (err) {
    return handleError(err);
  }
}
