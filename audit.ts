import { prisma } from "@/lib/prisma";

export async function logAudit(params: {
  actorId?: string | null;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: params.metadata as any,
    },
  });
}
