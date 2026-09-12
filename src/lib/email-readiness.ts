import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";

export interface EmailOperationalState {
  configured: boolean;
  verified: boolean;
  provider: string;
  reason: string | null;
  lastTestedAt: Date | null;
  cluster: "A" | "B" | null;
  webmailUrl: string | null;
  imapSmtpHost: string | null;
}

export function currentEmailCredentialFingerprint(): string | null {
  const cluster = process.env.OPENSRS_EMAIL_CLUSTER?.trim().toUpperCase();
  const baseUrl = process.env.OPENSRS_EMAIL_API_BASE_URL?.trim() || `cluster:${cluster}`;
  const adminUser = process.env.OPENSRS_EMAIL_ADMIN_USER?.trim();
  const password = process.env.OPENSRS_EMAIL_ADMIN_PASSWORD;
  const company = process.env.OPENSRS_EMAIL_COMPANY?.trim();
  if (!adminUser || !password || !company || !["A", "B"].includes(cluster || "")) return null;
  return crypto.createHash("sha256").update(`${baseUrl}|${cluster}|${adminUser}|${password}|${company}`).digest("hex");
}

export async function getEmailOperationalState(): Promise<EmailOperationalState> {
  const provider = getEmailProvider();
  const fingerprint = currentEmailCredentialFingerprint();
  if (!provider.isConfigured() || !fingerprint) {
    return {
      configured: false,
      verified: false,
      provider: provider.name,
      reason: "OpenSRS Hosted Email environment variables are incomplete.",
      lastTestedAt: null,
      cluster: null,
      webmailUrl: null,
      imapSmtpHost: null,
    };
  }

  const row = await prisma.providerCredential.findUnique({ where: { provider: "email_hosting" } });
  const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const testedFingerprint = typeof metadata.credentialFingerprint === "string" ? metadata.credentialFingerprint : null;
  const cluster = metadata.cluster === "A" || metadata.cluster === "B" ? metadata.cluster : null;
  const webmailUrl = typeof metadata.webmailUrl === "string" ? metadata.webmailUrl : null;
  const imapSmtpHost = typeof metadata.imapSmtpHost === "string" ? metadata.imapSmtpHost : null;
  const verified = row?.lastTestOk === true && row.isConfigured === true && testedFingerprint === fingerprint;

  return {
    configured: true,
    verified,
    provider: provider.name,
    lastTestedAt: row?.lastTestedAt ?? null,
    cluster: verified ? cluster : null,
    webmailUrl: verified ? webmailUrl : null,
    imapSmtpHost: verified ? imapSmtpHost : null,
    reason: verified ? null : testedFingerprint && testedFingerprint !== fingerprint
      ? "OpenSRS Hosted Email credentials changed after the last successful live test. Run the provider test again."
      : row?.lastTestMessage || "Run a successful OpenSRS Hosted Email provider test before activating business email products.",
  };
}
