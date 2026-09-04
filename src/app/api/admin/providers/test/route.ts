import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { logAudit } from "@/lib/audit";

const schema = z.object({ provider: z.enum(["namesilo", "paypal", "ai"]) });

/**
 * Runs a real, live connectivity check against the requested provider using
 * whatever credentials are currently in the environment. Never fabricates a
 * success result — spec section 151.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN"]);
    const { provider } = schema.parse(await req.json());

    let ok = false;
    let message = "";

    if (provider === "namesilo") {
      const domainProvider = getDomainProvider();
      if (!domainProvider.isConfigured()) {
        message = "NAMESILO_API_KEY is not set.";
      } else {
        try {
          await domainProvider.getPricing(["com"]);
          ok = true;
          message = "Connected successfully.";
        } catch (err: any) {
          message = err.message || "Connection failed.";
        }
      }
    }

    if (provider === "paypal") {
      if (!PayPalProvider.isConfigured()) {
        message = "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.";
      } else {
        try {
          // A successful OAuth token exchange is a sufficient live test —
          // it proves the credentials and PAYPAL_MODE/base URL are correct.
          await PayPalProvider.createOrder({
            amountCents: 100,
            currency: "USD",
            referenceId: `test-${Date.now()}`,
            description: "GetSawa connection test (not captured)",
            idempotencyKey: `test-${admin.id}-${Date.now()}`,
            returnUrl: `${process.env.APP_URL}/admin/providers`,
            cancelUrl: `${process.env.APP_URL}/admin/providers`,
          });
          ok = true;
          message = "Connected successfully. A test order was created (not captured, no charge occurred).";
        } catch (err: any) {
          message = err.message || "Connection failed.";
        }
      }
    }

    if (provider === "ai") {
      const ai = getAIProvider();
      if (!ai.isConfigured()) {
        message = "AI_API_KEY is not set.";
      } else {
        try {
          await ai.generateWebsiteContent({
            businessName: "Test Business",
            businessDescription: "A short connectivity test — this result is not saved anywhere.",
            pages: ["home"],
          });
          ok = true;
          message = "Connected successfully.";
        } catch (err: any) {
          message = err.message || "Connection failed.";
        }
      }
    }

    await prisma.providerCredential.upsert({
      where: { provider },
      create: { provider, isConfigured: ok, lastTestedAt: new Date(), lastTestOk: ok, lastTestMessage: message },
      update: { lastTestedAt: new Date(), lastTestOk: ok, lastTestMessage: message },
    });

    await logAudit({ actorId: admin.id, action: "provider.tested", resource: "provider", resourceId: provider, metadata: { ok, message } });

    if (!ok) return jsonError(message, 502, { provider, ok });
    return jsonOk({ provider, ok, message });
  } catch (err) {
    return handleError(err);
  }
}
