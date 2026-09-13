import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getCloudflareSecurityProvider } from "@/lib/providers/security/CloudflareSecurityProvider";

export interface SecurityOperationalState {
  configured: boolean;
  verified: boolean;
  provider: string;
  reason: string | null;
  lastTestedAt: Date | null;
}

export function currentCloudflareCredentialFingerprint(): string | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) return null;
  return crypto.createHash("sha256").update(`${accountId}|${token}`).digest("hex");
}

export async function getSecurityOperationalState(): Promise<SecurityOperationalState> {
  const provider = getCloudflareSecurityProvider();
  const fingerprint = currentCloudflareCredentialFingerprint();
  if (!provider.isConfigured() || !fingerprint) {
    return { configured: false, verified: false, provider: provider.name, reason: "Cloudflare account/token variables are incomplete.", lastTestedAt: null };
  }
  const row = await prisma.providerCredential.findUnique({ where: { provider: "cloudflare_security" } });
  const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {};
  const testedFingerprint = typeof metadata.credentialFingerprint === "string" ? metadata.credentialFingerprint : null;
  const verified = row?.lastTestOk === true && row.isConfigured === true && testedFingerprint === fingerprint;
  return {
    configured: true,
    verified,
    provider: provider.name,
    lastTestedAt: row?.lastTestedAt ?? null,
    reason: verified ? null : testedFingerprint && testedFingerprint !== fingerprint
      ? "Cloudflare credentials changed after the last successful live test. Run the provider test again."
      : row?.lastTestMessage || "Run a successful Cloudflare security provider test before activating security products.",
  };
}
