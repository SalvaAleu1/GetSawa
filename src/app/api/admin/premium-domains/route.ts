import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { computeTldPrice } from "@/lib/pricing";
import { getPricingSafetyPolicy } from "@/lib/pricing-policy";
import { computeSafeRetailPrice } from "@/lib/pricing-safety";
import { verifyPremiumInventory } from "@/lib/premium-aftermarket";
import { listPremiumInventoryForAdmin, premiumMarketplaceMetrics } from "@/lib/premium-admin";

const createSchema = z.object({
  domainName: z.string().trim().min(3).max(253).transform((value) => value.toLowerCase()),
  retailPriceCents: z.number().int().positive(),
  acquisitionCostCents: z.number().int().min(0),
  category: z.string().trim().max(100).optional(),
  isFeatured: z.boolean().default(false),
  autoBuyEnabled: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireAdmin();
    const [listings, metrics] = await Promise.all([listPremiumInventoryForAdmin(), premiumMarketplaceMetrics()]);
    return jsonOk({ listings, metrics });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN", "PRODUCT_MANAGER"]);
    const input = createSchema.parse(await req.json());
    const existing = await prisma.premiumDomain.findUnique({ where: { domainName: input.domainName } });
    if (existing) return jsonError("This domain already has a premium inventory record.", 409);

    const domain = await prisma.domain.findUnique({ where: { name: input.domainName }, include: { tld: true, user: true } });
    if (!domain) return jsonError("The domain must already be managed in GetSawa before it can be listed for sale.", 400);
    if (!["ACTIVE", "EXPIRING"].includes(domain.status)) return jsonError("Only active managed domains can be listed for sale.", 400);
    if (!domain.user.adminRole) return jsonError("Customer-owned domains must be submitted by their owner through the marketplace listing workflow.", 403);

    const policy = await getPricingSafetyPolicy();
    const protectedFloor = computeSafeRetailPrice(input.acquisitionCostCents, policy).retailCents;
    if (input.retailPriceCents < protectedFloor) {
      return jsonError(`The retail price is below GetSawa's protected minimum of ${(protectedFloor / 100).toFixed(2)} USD for this acquisition cost.`, 400);
    }

    const renewalPriceCents = computeTldPrice(domain.tld).renewCents;
    const listing = await prisma.premiumDomain.create({
      data: {
        domainName: domain.name,
        tldId: domain.tldId,
        purchasePriceCents: input.retailPriceCents,
        renewalPriceCents,
        currency: "USD",
        category: input.category || undefined,
        isFeatured: input.isFeatured,
        status: "DELISTED",
      },
    });

    try {
      await verifyPremiumInventory({
        premiumDomainId: listing.id,
        adminUserId: admin.id,
        source: "GETSAWA_INVENTORY",
        acquisitionCostCents: input.acquisitionCostCents,
        commissionBps: 0,
        autoBuyEnabled: input.autoBuyEnabled,
      });
    } catch (verificationError) {
      await logAudit({ actorId: admin.id, action: "premium_inventory.verification_failed", resource: "premium_domain", resourceId: listing.id, metadata: { reason: verificationError instanceof Error ? verificationError.message.slice(0, 400) : "Verification failed" } });
      return jsonError("The inventory record was saved but could not be published because registrar custody was not verified.", 409, { listingId: listing.id });
    }

    await logAudit({ actorId: admin.id, action: "premium_inventory.created", resource: "premium_domain", resourceId: listing.id, metadata: { domainName: domain.name, retailPriceCents: input.retailPriceCents, acquisitionCostCents: input.acquisitionCostCents } });
    return jsonOk({ listingId: listing.id }, 201);
  } catch (err) {
    return handleError(err);
  }
}
