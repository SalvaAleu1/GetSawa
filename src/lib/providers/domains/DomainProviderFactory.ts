import { assertProviderRoutingPlan } from "@/lib/providers/provider-routing";
import { DomainProvider } from "./DomainProvider";
import { NameSiloProvider } from "./NameSiloProvider";

let instance: DomainProvider | null = null;
let selectedProvider: string | null = null;

/**
 * Returns the active domain provider through the validated provider-routing
 * contract. NameSilo is the only implemented registrar today. A configured
 * secondary/alternate registrar is rejected until its real DomainProvider
 * adapter exists; this prevents mock or guessed registrar failover.
 */
export function getDomainProvider(): DomainProvider {
  const plan = assertProviderRoutingPlan("domains");
  if (instance && selectedProvider === plan.primary) return instance;

  switch (plan.primary) {
    case "namesilo":
      instance = new NameSiloProvider();
      selectedProvider = plan.primary;
      return instance;
    default:
      throw new Error(`Domain provider ${plan.primary} is not implemented.`);
  }
}
