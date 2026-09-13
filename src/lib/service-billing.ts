import { prisma } from "@/lib/prisma";
import { createHostingRenewalOrder, advanceHostingSubscriptionAfterPayment, refreshHostingRenewalOrderPrice } from "@/lib/hosting-billing";
import { createEmailRenewalOrder, advanceEmailSubscriptionAfterPayment, refreshEmailRenewalOrderPrice } from "@/lib/email-billing";
import { createSecurityRenewalOrder, advanceSecuritySubscriptionAfterPayment, refreshSecurityRenewalOrderPrice } from "@/lib/security-billing";

export interface ServiceSubscriptionRef {
  id: string;
  userId: string;
  serviceInstanceId: string;
  currentPeriodEnd: Date;
  billingCycle: string;
}

async function providerForService(serviceInstanceId: string) {
  const rows = await prisma.$queryRaw<Array<{ provider_name: string }>>`
    SELECT "provider_name" FROM "product_service_instances" WHERE "id"=${serviceInstanceId} LIMIT 1
  `;
  const provider = rows[0]?.provider_name;
  if (!provider) throw new Error("Service instance provider could not be resolved.");
  return provider;
}

export async function createServiceRenewalOrder(subscription: ServiceSubscriptionRef) {
  const provider = await providerForService(subscription.serviceInstanceId);
  if (provider === "cpanel_whm") return createHostingRenewalOrder(subscription);
  if (provider === "opensrs_hosted_email") return createEmailRenewalOrder(subscription);
  if (provider === "cloudflare") return createSecurityRenewalOrder(subscription);
  throw new Error(`Recurring billing is not implemented for service provider ${provider}.`);
}

export async function advanceServiceSubscriptionAfterPayment(subscriptionId: string, serviceInstanceId: string) {
  const provider = await providerForService(serviceInstanceId);
  if (provider === "cpanel_whm") return advanceHostingSubscriptionAfterPayment(subscriptionId);
  if (provider === "opensrs_hosted_email") return advanceEmailSubscriptionAfterPayment(subscriptionId);
  if (provider === "cloudflare") return advanceSecuritySubscriptionAfterPayment(subscriptionId);
  throw new Error(`Renewal advancement is not implemented for service provider ${provider}.`);
}

export async function refreshServiceRenewalOrderPrice(params: { orderId: string; userId: string; subscriptionId: string; serviceInstanceId: string }) {
  const provider = await providerForService(params.serviceInstanceId);
  if (provider === "cpanel_whm") return refreshHostingRenewalOrderPrice(params);
  if (provider === "opensrs_hosted_email") return refreshEmailRenewalOrderPrice(params);
  if (provider === "cloudflare") return refreshSecurityRenewalOrderPrice(params);
  throw new Error(`Renewal repricing is not implemented for service provider ${provider}.`);
}
