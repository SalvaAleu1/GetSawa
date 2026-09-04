import { prisma } from "@/lib/prisma";
import { AuthError } from "@/lib/auth";

export async function getOwnedDomainOrThrow(domainId: string, userId: string) {
  const domain = await prisma.domain.findUnique({ where: { id: domainId }, include: { tld: true } });
  if (!domain || domain.userId !== userId) {
    throw new AuthError("Domain not found.", 404);
  }
  return domain;
}
