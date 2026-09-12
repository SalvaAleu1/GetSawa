import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { transitionOrderStatus } from "@/lib/order-lifecycle";
import { releaseOrderCredit } from "@/lib/credits";
import { releaseOrRestorePremiumOrderReservations } from "@/lib/premium-checkout";

export async function handlePaymentAttemptFailure(params: {
  paymentId: string;
  orderId: string;
  message: string;
  providerStatus?: string | null;
}) {
  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId }, include: { order: true } });
  if (!payment) return { renewal: false, recorded: false };
  if (payment.status === "PAID" || payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") {
    return { renewal: false, recorded: false };
  }

  await prisma.payment.updateMany({
    where: { id: payment.id, status: { notIn: ["PAID", "REFUNDED", "PARTIALLY_REFUNDED"] } },
    data: { status: "FAILED", failureReason: params.message.slice(0, 500) },
  });

  const eventKey = `failure:${payment.provider}:${payment.id}`;
  const inserted = await prisma.$executeRaw`
    INSERT INTO "finance_events"
      ("id","event_key","event_type","payment_id","order_id","provider","gross_cents","provider_fee_cents","net_cents","currency","provider_reference")
    VALUES
      (${crypto.randomUUID()},${eventKey},'PAYMENT_FAILED',${payment.id},${payment.orderId},${payment.provider},0,0,0,${payment.currency.toUpperCase()},${params.providerStatus || payment.providerOrderId || payment.id})
    ON CONFLICT ("event_key") DO NOTHING
  `;
  const firstRecord = Number(inserted) === 1;

  const renewals = await prisma.$queryRaw<Array<{ subscription_id: string }>>`
    SELECT "subscription_id" FROM "billing_renewal_attempts" WHERE "order_id"=${payment.orderId} LIMIT 1
  `;
  const renewal = renewals[0];

  if (renewal) {
    await prisma.$executeRaw`
      UPDATE "billing_renewal_attempts"
      SET "status"='FAILED',"attempted_at"=COALESCE("attempted_at",CURRENT_TIMESTAMP),"failure_code"='PAYMENT_FAILED',"failure_message"=${params.message.slice(0, 500)},"updated_at"=CURRENT_TIMESTAMP
      WHERE "order_id"=${payment.orderId}
    `;
    if (firstRecord) {
      await prisma.$executeRaw`
        UPDATE "billing_subscriptions"
        SET "status"='PAST_DUE',"failed_payment_count"="failed_payment_count"+1,"grace_until"=COALESCE("grace_until",CURRENT_TIMESTAMP+INTERVAL '7 days'),"updated_at"=CURRENT_TIMESTAMP
        WHERE "id"=${renewal.subscription_id}
      `;
    }
    // Renewal invoices deliberately remain PENDING_PAYMENT so the customer can
    // create another freshly-priced PayPal attempt from Billing.
    await prisma.order.updateMany({ where: { id: payment.orderId, status: "FAILED" }, data: { status: "PENDING_PAYMENT" } });
    await prisma.invoice.updateMany({ where: { orderId: payment.orderId, status: { not: "REFUNDED" } }, data: { status: "UNPAID", paidAt: null } });
    return { renewal: true, recorded: firstRecord };
  }

  await releaseOrderCredit(payment.orderId).catch(() => undefined);
  await releaseOrRestorePremiumOrderReservations(payment.orderId, payment.userId).catch(() => undefined);
  await transitionOrderStatus({
    orderId: payment.orderId,
    to: "FAILED",
    reason: "Payment attempt was not completed.",
    metadata: { provider: payment.provider, providerStatus: params.providerStatus || null },
  }).catch(() => undefined);
  return { renewal: false, recorded: firstRecord };
}
