import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { isEmailConfigured } from "@/lib/email";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { getHostingOperationalState } from "@/lib/hosting-readiness";

/** Never returns secret values; only configuration and live-test state. */
export async function GET() {
  try {
    await requireAdmin();

    const domainProvider = getDomainProvider();
    const hostingProvider = getHostingProvider();
    const dbHealthy = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    const [rows, hostingState] = await Promise.all([
      prisma.providerCredential.findMany(),
      getHostingOperationalState(),
    ]);
    const byProvider = new Map(rows.map((row) => [row.provider, row]));

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
        label: "cPanel / WHM Hosting",
        isConfigured: hostingProvider.isConfigured(),
        operational: hostingState.verified,
        operationalReason: hostingState.reason,
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
