import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";

export function currentHostingCredentialFingerprint(): string | null {
  const baseUrl = process.env.WHM_BASE_URL?.trim();
  const username = process.env.WHM_USERNAME?.trim();
  const token = process.env.WHM_API_TOKEN;
  if (!baseUrl || !username || !token) return null;
  return crypto.createHash("sha256").update(`${baseUrl}|${username}|${token}`).digest("hex");
}

export async function getHostingOperationalState() {
  const provider = getHostingProvider();
  const fingerprint = currentHostingCredentialFingerprint();
  if (!provider.isConfigured() || !fingerprint) {
    return { configured: false, verified: false, provider: provider.name, reason: "cPanel/WHM environment variables are incomplete." };
  }

  const row = await prisma.providerCredential.findUnique({ where: { provider: "hosting" } });
  const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const testedFingerprint = typeof metadata.credentialFingerprint === "string" ? metadata.credentialFingerprint : null;
  const verified = row?.lastTestOk === true && row.isConfigured === true && testedFingerprint === fingerprint;

  return {
    configured: true,
    verified,
    provider: provider.name,
    lastTestedAt: row?.lastTestedAt ?? null,
    reason: verified ? null : testedFingerprint && testedFingerprint !== fingerprint
      ? "Hosting credentials changed after the last successful live test. Run the provider test again."
      : row?.lastTestMessage || "Run a successful live WHM provider test before activating hosting products.",
  };
}
