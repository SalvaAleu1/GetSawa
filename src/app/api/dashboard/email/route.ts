import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const services = await prisma.$queryRaw<Array<{
      id: string;
      status: string;
      provider_resource_id: string;
      metadata: unknown;
      created_at: Date;
      product_id: string;
      product_name: string;
      billing_cycle: string;
      domain_id: string | null;
      domain_name: string | null;
      subscription_id: string | null;
      subscription_status: string | null;
      current_period_end: Date | null;
      next_billing_at: Date | null;
      grace_until: Date | null;
      auto_renew: boolean | null;
      cancel_at_period_end: boolean | null;
      amount_cents: number | null;
      currency: string | null;
      email_domain_status: string | null;
      dns_status: unknown;
      last_dns_checked_at: Date | null;
    }>>`
      SELECT psi."id",psi."status",psi."provider_resource_id",psi."metadata",psi."created_at",
             p."id" AS product_id,p."name" AS product_name,p."billingCycle" AS billing_cycle,
             d."id" AS domain_id,d."name" AS domain_name,
             bs."id" AS subscription_id,bs."status" AS subscription_status,bs."current_period_end",bs."next_billing_at",bs."grace_until",bs."auto_renew",bs."cancel_at_period_end",bs."amount_cents",bs."currency",
             eds."status" AS email_domain_status,eds."dns_status",eds."last_dns_checked_at"
      FROM "product_service_instances" psi
      JOIN "Product" p ON p."id"=psi."product_id"
      LEFT JOIN "Domain" d ON d."id"=psi."domain_id"
      LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id"
      LEFT JOIN "email_domain_services" eds ON eds."domain_id"=psi."domain_id" AND eds."provider_name"=psi."provider_name"
      WHERE psi."user_id"=${user.id} AND psi."provider_name"='opensrs_hosted_email'
      ORDER BY psi."created_at" DESC
      LIMIT 100
    `;

    const operational = await getEmailOperationalState();
    const provider = getEmailProvider();
    const enriched = await Promise.all(services.map(async (service) => {
      let live = null;
      let liveError: string | null = null;
      if (operational.verified && service.status !== "TERMINATED") {
        try {
          live = await provider.getMailbox(service.provider_resource_id);
          if (!live) liveError = "OpenSRS mailbox was not found during live reconciliation.";
        } catch (error) {
          liveError = error instanceof Error ? error.message : "Live OpenSRS mailbox lookup failed.";
        }
      }
      return {
        id: service.id,
        status: service.status,
        address: service.provider_resource_id,
        productId: service.product_id,
        productName: service.product_name,
        billingCycle: service.billing_cycle,
        domainId: service.domain_id,
        domainName: service.domain_name,
        metadata: service.metadata,
        createdAt: service.created_at,
        billing: service.subscription_id ? {
          id: service.subscription_id,
          status: service.subscription_status,
          currentPeriodEnd: service.current_period_end,
          nextBillingAt: service.next_billing_at,
          graceUntil: service.grace_until,
          autoRenew: service.auto_renew,
          cancelAtPeriodEnd: service.cancel_at_period_end,
          amountCents: service.amount_cents,
          currency: service.currency,
        } : null,
        dns: service.domain_id ? {
          status: service.email_domain_status,
          detail: service.dns_status,
          lastCheckedAt: service.last_dns_checked_at,
        } : null,
        live,
        liveError,
      };
    }));

    return jsonOk({
      provider: {
        configured: operational.configured,
        verified: operational.verified,
        reason: operational.reason,
        cluster: operational.cluster,
        webmailUrl: operational.webmailUrl,
        imapSmtpHost: operational.imapSmtpHost,
        lastTestedAt: operational.lastTestedAt,
      },
      services: enriched,
    });
  } catch (error) {
    return handleError(error);
  }
}
