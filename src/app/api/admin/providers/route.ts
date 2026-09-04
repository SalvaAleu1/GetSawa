import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { isEmailConfigured } from "@/lib/email";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";

/**
 * Returns configuration status for every provider. This never returns
 * secret values — only whether each integration is configured, and
 * (if a live test was previously run) whether it last succeeded.
 */
export async function GET() {
  try {
    await requireAdmin();

    const domainProvider = getDomainProvider();
    const dbHealthy = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);

    const rows = await prisma.providerCredential.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    const providers = [
      {
        provider: "namesilo",
        label: "NameSilo (Domains)",
        isConfigured: domainProvider.isConfigured(),
        ...pickStatus(byProvider.get("namesilo")),
      },
      {
        provider: "paypal",
        label: "PayPal (Payments)",
        isConfigured: PayPalProvider.isConfigured(),
        ...pickStatus(byProvider.get("paypal")),
      },
      {
        provider: "smtp",
        label: "Email (SMTP)",
        isConfigured: isEmailConfigured(),
        ...pickStatus(byProvider.get("smtp")),
      },
      {
        provider: "hosting",
        label: "Hosting",
        isConfigured: Boolean(process.env.HOSTING_API_KEY),
        ...pickStatus(byProvider.get("hosting")),
      },
      {
        provider: "email_hosting",
        label: "Business Email",
        isConfigured: Boolean(process.env.EMAIL_PROVIDER_API_KEY),
        ...pickStatus(byProvider.get("email_hosting")),
      },
      {
        provider: "ai",
        label: "AI (Website Builder)",
        isConfigured: getAIProvider().isConfigured(),
        ...pickStatus(byProvider.get("ai")),
      },
      {
        provider: "storage",
        label: "Object Storage",
        isConfigured: Boolean(process.env.STORAGE_PROVIDER),
        ...pickStatus(byProvider.get("storage")),
      },
    ];

    return jsonOk({ database: dbHealthy ? "operational" : "unavailable", providers });
  } catch (err) {
    return handleError(err);
  }
}

function pickStatus(row?: { lastTestedAt: Date | null; lastTestOk: boolean | null; lastTestMessage: string | null }) {
  if (!row) return { lastTestedAt: null, lastTestOk: null, lastTestMessage: null };
  return { lastTestedAt: row.lastTestedAt, lastTestOk: row.lastTestOk, lastTestMessage: row.lastTestMessage };
}
