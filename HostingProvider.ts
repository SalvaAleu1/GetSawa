/**
 * No specific hosting vendor was named in the platform spec, so there is no
 * concrete implementation of this interface yet — implementing it against a
 * real vendor's control-panel API (cPanel/WHM, Plesk, a cloud host's API,
 * etc.) is what turns "Hosting" from a listed product category into an
 * actually-purchasable product. Until then, HOSTING_API_KEY stays unset,
 * `getHostingProvider().isConfigured()` returns false, and the admin
 * product-activation workflow (see /api/admin/products/[id]) refuses to
 * activate any hosting product — exactly the same fail-safe pattern used
 * for every other unconfigured provider in this codebase.
 */
export interface HostingAccountRequest {
  planCode: string;
  domain: string;
  customerEmail: string;
  idempotencyKey: string;
}

export interface HostingAccountResult {
  success: boolean;
  providerAccountId?: string;
  controlPanelUrl?: string;
  errorMessage?: string;
}

export interface HostingProvider {
  readonly name: string;
  isConfigured(): boolean;
  provisionAccount(req: HostingAccountRequest): Promise<HostingAccountResult>;
  suspendAccount(providerAccountId: string): Promise<void>;
  unsuspendAccount(providerAccountId: string): Promise<void>;
  terminateAccount(providerAccountId: string): Promise<void>;
}

export class UnconfiguredHostingProvider implements HostingProvider {
  readonly name = "none";
  isConfigured(): boolean {
    return false;
  }
  async provisionAccount(): Promise<HostingAccountResult> {
    return { success: false, errorMessage: "No hosting provider is configured yet." };
  }
  async suspendAccount(): Promise<void> {
    throw new Error("No hosting provider is configured.");
  }
  async unsuspendAccount(): Promise<void> {
    throw new Error("No hosting provider is configured.");
  }
  async terminateAccount(): Promise<void> {
    throw new Error("No hosting provider is configured.");
  }
}

export function getHostingProvider(): HostingProvider {
  // Swap in a real implementation here once a vendor is chosen — nothing
  // else in the codebase needs to change (same pattern as DomainProviderFactory).
  return new UnconfiguredHostingProvider();
}
