import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const tickets = await prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      include: { user: { select: { email: true, firstName: true, lastName: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return jsonOk({ tickets });
  } catch (err) {
    return handleError(err);
  }
}
