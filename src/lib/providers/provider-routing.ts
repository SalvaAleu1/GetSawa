export type ProviderCapability = "domains" | "payments" | "hosting" | "email" | "security" | "publishing" | "ai";

const implementedProviders: Record<ProviderCapability, readonly string[]> = {
  domains: ["namesilo"],
  payments: ["paypal"],
  hosting: ["whm"],
  email: ["opensrs"],
  security: ["cloudflare"],
  publishing: ["cloudflare"],
  ai: ["anthropic"],
};

const defaults: Record<ProviderCapability, string> = {
  domains: "namesilo",
  payments: "paypal",
  hosting: "whm",
  email: "opensrs",
  security: "cloudflare",
  publishing: "cloudflare",
  ai: "anthropic",
};

const envKeys: Record<ProviderCapability, { primary: string; secondary: string }> = {
  domains: { primary: "DOMAIN_PROVIDER", secondary: "DOMAIN_SECONDARY_PROVIDER" },
  payments: { primary: "PAYMENT_PROVIDER", secondary: "PAYMENT_SECONDARY_PROVIDER" },
  hosting: { primary: "HOSTING_PROVIDER", secondary: "HOSTING_SECONDARY_PROVIDER" },
  email: { primary: "EMAIL_PROVIDER", secondary: "EMAIL_SECONDARY_PROVIDER" },
  security: { primary: "SECURITY_PROVIDER", secondary: "SECURITY_SECONDARY_PROVIDER" },
  publishing: { primary: "PUBLISHING_PROVIDER", secondary: "PUBLISHING_SECONDARY_PROVIDER" },
  ai: { primary: "AI_PROVIDER", secondary: "AI_SECONDARY_PROVIDER" },
};

function clean(value: string | undefined) {
  return value?.trim().toLowerCase() || null;
}

function automaticFailoverCapabilities(): Set<string> {
  return new Set(
    (process.env.PROVIDER_AUTOMATIC_FAILOVER_CAPABILITIES || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export interface ProviderRoutingPlan {
  capability: ProviderCapability;
  primary: string;
  secondary: string | null;
  implemented: readonly string[];
  automaticFailoverRequested: boolean;
  automaticFailoverEligible: boolean;
}

export function getProviderRoutingPlan(capability: ProviderCapability): ProviderRoutingPlan {
  const keys = envKeys[capability];
  const primary = clean(process.env[keys.primary]) || defaults[capability];
  const secondary = clean(process.env[keys.secondary]);
  const implemented = implementedProviders[capability];
  const requested = automaticFailoverCapabilities();
  const automaticFailoverRequested = requested.has(capability) || requested.has("*");
  const automaticFailoverEligible = Boolean(
    secondary &&
    secondary !== primary &&
    implemented.includes(primary) &&
    implemented.includes(secondary),
  );

  return { capability, primary, secondary, implemented, automaticFailoverRequested, automaticFailoverEligible };
}

export function assertProviderRoutingPlan(capability: ProviderCapability): ProviderRoutingPlan {
  const plan = getProviderRoutingPlan(capability);
  if (!plan.implemented.includes(plan.primary)) {
    throw new Error(`Unsupported ${capability} provider: ${plan.primary}. An implemented provider adapter is required before selection.`);
  }
  if (plan.secondary && !plan.implemented.includes(plan.secondary)) {
    throw new Error(`Unsupported secondary ${capability} provider: ${plan.secondary}. Configure it only after its adapter and acceptance tests exist.`);
  }
  if (plan.secondary === plan.primary) {
    throw new Error(`Primary and secondary ${capability} providers must be different.`);
  }
  if (plan.automaticFailoverRequested && !plan.automaticFailoverEligible) {
    throw new Error(`Automatic ${capability} provider failover is not eligible with the implemented provider set.`);
  }
  if (plan.automaticFailoverRequested && !process.env.PROVIDER_FAILOVER_APPROVAL_ID?.trim()) {
    throw new Error("PROVIDER_FAILOVER_APPROVAL_ID is required when automatic provider failover is enabled.");
  }
  return plan;
}

export function listImplementedProviders(capability: ProviderCapability): readonly string[] {
  return implementedProviders[capability];
}
