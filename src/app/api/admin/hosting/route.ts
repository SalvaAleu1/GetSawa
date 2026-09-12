import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getHostingOperationalState } from "@/lib/hosting-readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin(["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT", "PRODUCT_MANAGER"]);
    const [operational, services] = await Promise.all([
      getHostingOperationalState(),
      prisma.$queryRaw<Array<{
        id: string;
        status: string;
        provider_resource_id: string;
        created_at: Date;
        customer_id: string;
        customer_email: string;
        customer_name: string;
        product_name: string;
        domain_name: string | null;
        subscription_status: string | null;
        current_period_end: Date | null;
        grace_until: Date | null;
      }>>`
        SELECT psi."id",psi."status",psi."provider_resource_id",psi."created_at",
               u."id" AS customer_id,u."email" AS customer_email,(u."firstName" || ' ' || u."lastName") AS customer_name,
               p."name" AS product_name,d."name" AS domain_name,
               bs."status" AS subscription_status,bs."current_period_end",bs."grace_until"
        FROM "product_service_instances" psi
        JOIN "User" u ON u."id"=psi."user_id"
        JOIN "Product" p ON p."id"=psi."product_id"
        LEFT JOIN "Domain" d ON d."id"=psi."domain_id"
        LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id"
        WHERE psi."provider_name"='cpanel_whm'
        ORDER BY psi."created_at" DESC
        LIMIT 200
      `,
    ]);
    return jsonOk({
      provider: { configured: operational.configured, verified: operational.verified, reason: operational.reason ?? null, lastTestedAt: operational.lastTestedAt ?? null },
      services: services.map((service) => ({
        id: service.id,
        status: service.status,
        createdAt: service.created_at,
        customerId: service.customer_id,
        customerEmail: service.customer_email,
        customerName: service.customer_name,
        productName: service.product_name,
        domainName: service.domain_name,
        billingStatus: service.subscription_status,
        currentPeriodEnd: service.current_period_end,
        graceUntil: service.grace_until,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
