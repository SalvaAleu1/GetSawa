import { assertProviderRoutingPlan } from "@/lib/providers/provider-routing";
import type { PaymentProvider } from "./PaymentProvider";
import { PayPalProvider } from "./PayPalProvider";

let instance: PaymentProvider | null = null;
let selectedProvider: string | null = null;

/**
 * Payment provider selection seam. PayPal remains the only implemented payment
 * adapter today. Unknown/secondary providers fail closed until a real adapter
 * and production acceptance evidence exist.
 */
export function getPaymentProvider(): PaymentProvider {
  const plan = assertProviderRoutingPlan("payments");
  if (instance && selectedProvider === plan.primary) return instance;

  switch (plan.primary) {
    case "paypal":
      instance = PayPalProvider;
      selectedProvider = plan.primary;
      return instance;
    default:
      throw new Error(`Payment provider ${plan.primary} is not implemented.`);
  }
}
