import { handleFullyRefundedHostingOrder } from "@/lib/hosting-billing";
import { handleFullyRefundedEmailOrder } from "@/lib/email-billing";
import { handleFullyRefundedSecurityOrder } from "@/lib/security-billing";

export async function handleFullyRefundedServices(orderId: string) {
  const [hosting, email, security] = await Promise.all([
    handleFullyRefundedHostingOrder(orderId).catch((error) => ({ found: 0, suspended: 0, pending: 0, error: error instanceof Error ? error.message : "Hosting refund enforcement failed." })),
    handleFullyRefundedEmailOrder(orderId).catch((error) => ({ found: 0, suspended: 0, pending: 0, error: error instanceof Error ? error.message : "Email refund enforcement failed." })),
    handleFullyRefundedSecurityOrder(orderId).catch((error) => ({ found: 0, suspended: 0, pending: 0, error: error instanceof Error ? error.message : "Security refund enforcement failed." })),
  ]);
  return { hosting, email, security };
}
