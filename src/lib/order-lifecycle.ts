import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_CONFIRMED",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type OrderLifecycleStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderLifecycleStatus, readonly OrderLifecycleStatus[]> = {
  PENDING_PAYMENT: ["PAYMENT_CONFIRMED", "CANCELLED", "REFUNDED"],
  PAYMENT_CONFIRMED: ["PROVISIONING", "FAILED", "CANCELLED", "REFUNDED"],
  PROVISIONING: ["ACTIVE", "FAILED", "CANCELLED", "REFUNDED"],
  ACTIVE: ["REFUNDED"],
  FAILED: ["PROVISIONING", "CANCELLED", "REFUNDED"],
  CANCELLED: ["REFUNDED"],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderLifecycleStatus, to: OrderLifecycleStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

/**
 * Performs an optimistic order-state transition and records it in the audit log.
 * Same-state transitions are treated as idempotent no-ops.
 */
export async function transitionOrderStatus(params: {
  orderId: string;
  to: OrderLifecycleStatus;
  actorId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ changed: boolean; from: OrderLifecycleStatus; to: OrderLifecycleStatus }> {
  const order = await prisma.order.findUnique({ where: { id: params.orderId }, select: { id: true, status: true } });
  if (!order) throw new Error("Order not found.");

  const from = order.status as OrderLifecycleStatus;
  if (!canTransitionOrder(from, params.to)) {
    throw new Error(`Invalid order lifecycle transition from ${from} to ${params.to}.`);
  }
  if (from === params.to) return { changed: false, from, to: params.to };

  const updated = await prisma.order.updateMany({
    where: { id: params.orderId, status: from },
    data: { status: params.to },
  });

  if (updated.count !== 1) {
    // Another worker may have advanced the order. Re-read it so callers can
    // safely treat concurrent webhook/retry delivery as idempotent.
    const current = await prisma.order.findUnique({ where: { id: params.orderId }, select: { status: true } });
    if (current && current.status === params.to) return { changed: false, from, to: params.to };
    throw new Error("Order changed concurrently; lifecycle transition was not applied.");
  }

  try {
    await logAudit({
      actorId: params.actorId ?? null,
      action: `ORDER_STATUS_${from}_TO_${params.to}`,
      resource: "order",
      resourceId: params.orderId,
      metadata: { from, to: params.to, reason: params.reason, ...(params.metadata ?? {}) },
    });
  } catch {
    // Financial/fulfilment state must not be rolled back because an audit sink
    // is temporarily unavailable. The state transition remains durable.
  }

  return { changed: true, from, to: params.to };
}

export function provisioningStatusLabel(status: string): "PENDING" | "PROVISIONING" | "PROVISIONED" | "FAILED" {
  if (status === "PROVISIONING" || status === "PROVISIONED" || status === "FAILED") return status;
  return "PENDING";
}
