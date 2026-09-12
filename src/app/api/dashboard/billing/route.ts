import { Prisma } from "@prisma/client";
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

    const domainIds = subscriptions.map((subscription) => subscription.domainId).filter((id): id is string => Boolean(id));
    const serviceIds = subscriptions.map((subscription) => subscription.serviceInstanceId).filter((id): id is string => Boolean(id));
    const [domains, services] = await Promise.all([
      domainIds.length > 0
        ? prisma.domain.findMany({ where: { id: { in: domainIds }, userId: user.id }, select: { id: true, name: true } })
        : Promise.resolve([]),
      serviceIds.length > 0
        ? prisma.$queryRaw<Array<{ id: string; product_name: string; domain_name: string | null }>>`
            SELECT psi."id",p."name" AS product_name,d."name" AS domain_name
            FROM "product_service_instances" psi
            JOIN "Product" p ON p."id"=psi."product_id"
            LEFT JOIN "Domain" d ON d."id"=psi."domain_id"
            WHERE psi."user_id"=${user.id} AND psi."id" IN (${Prisma.join(serviceIds)})
          `
        : Promise.resolve([]),
    ]);
    const domainNames = new Map(domains.map((domain) => [domain.id, domain.name]));
    const serviceNames = new Map(services.map((service) => [service.id, service.domain_name ? `${service.product_name} — ${service.domain_name}` : service.product_name]));
    const labeledSubscriptions = subscriptions.map((subscription) => ({
      ...subscription,
      serviceLabel: subscription.serviceInstanceId
        ? serviceNames.get(subscription.serviceInstanceId) || "Web Hosting"
        : subscription.domainId
          ? domainNames.get(subscription.domainId) || "Domain renewal"
          : "Recurring service",
    }));

    return jsonOk({
      subscriptions: labeledSubscriptions,
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
