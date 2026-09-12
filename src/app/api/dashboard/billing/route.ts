import { requireUser } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { listCustomerSubscriptions, listRenewalAttemptsForUser } from "@/lib/billing";
import { getAvailableCustomerCredit, getCustomerCreditBalance } from "@/lib/credits";
import { prisma } from "@/lib/prisma";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const [subscriptions, renewals, creditBalanceCents, availableCreditCents, invoices] = await Promise.all([
      listCustomerSubscriptions(user.id),
      listRenewalAttemptsForUser(user.id),
      getCustomerCreditBalance(user.id),
      getAvailableCustomerCredit(user.id),
      prisma.invoice.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { id: true, invoiceNumber: true, orderId: true, totalCents: true, currency: true, status: true, paidAt: true, createdAt: true },
      }),
    ]);
    return jsonOk({
      subscriptions,
      renewals,
      invoices,
      creditBalanceCents,
      availableCreditCents,
      paymentMethods: {
        paypal: { enabled: PayPalProvider.isConfigured() },
        directCardGateway: { enabled: false, reason: "No separate production card gateway is configured." },
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
