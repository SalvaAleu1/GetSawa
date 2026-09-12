import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "SUPPORT", "FINANCE", "PRODUCT_MANAGER"]);
    const services = await prisma.$queryRaw<Array<{
      id: string;
      status: string;
      provider_resource_id: string;
      created_at: Date;
      user_id: string;
      customer_email: string;
      first_name: string;
      last_name: string;
      product_name: string;
      billing_cycle: string;
      domain_name: string | null;
      subscription_status: string | null;
      current_period_end: Date | null;
      auto_renew: boolean | null;
      email_domain_status: string | null;
    }>>`
      SELECT psi."id",psi."status",psi."provider_resource_id",psi."created_at",psi."user_id",
             u."email" AS customer_email,u."firstName" AS first_name,u."lastName" AS last_name,
             p."name" AS product_name,p."billingCycle" AS billing_cycle,d."name" AS domain_name,
             bs."status" AS subscription_status,bs."current_period_end",bs."auto_renew",
             eds."status" AS email_domain_status
      FROM "product_service_instances" psi
      JOIN "User" u ON u."id"=psi."user_id"
      JOIN "Product" p ON p."id"=psi."product_id"
      LEFT JOIN "Domain" d ON d."id"=psi."domain_id"
      LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id"
      LEFT JOIN "email_domain_services" eds ON eds."domain_id"=psi."domain_id" AND eds."provider_name"=psi."provider_name"
      WHERE psi."provider_name"='opensrs_hosted_email'
      ORDER BY psi."created_at" DESC LIMIT 100
    `;
    const operational = await getEmailOperationalState();
    const provider = getEmailProvider();
    const items = await Promise.all(services.map(async (service) => {
      let liveStatus: string | null = null;
      let liveError: string | null = null;
      if (operational.verified && service.status !== "TERMINATED") {
        try {
          const live = await provider.getMailbox(service.provider_resource_id);
          liveStatus = live?.status ?? "NOT_FOUND";
        } catch (error) {
          liveError = error instanceof Error ? error.message : "Provider lookup failed.";
        }
      }
      return { ...service, liveStatus, liveError };
    }));
    return jsonOk({ provider: operational, services: items });
  } catch (error) {
    return handleError(error);
  }
}
