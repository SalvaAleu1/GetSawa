import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { verifyPremiumInventory } from "@/lib/premium-aftermarket";

export async function submitPremiumListingRequest(params: {
  sellerUserId: string;
  domainId: string;
  askingPriceCents: number;
  category?: string | null;
}) {
  const domain = await prisma.domain.findFirst({ where: { id: params.domainId, userId: params.sellerUserId }, include: { tld: true } });
  if (!domain) throw new Error("Domain not found in your account.");
  if (!["ACTIVE", "EXPIRING"].includes(domain.status)) throw new Error("Only active domains can be submitted for sale.");
  if (params.askingPriceCents <= 0) throw new Error("Enter a valid asking price.");

  const existing = await prisma.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id","status" FROM "premium_listing_requests"
    WHERE "domain_id"=${domain.id} AND "status" IN ('SUBMITTED','APPROVED') LIMIT 1
  `;
  if (existing[0]) throw new Error("This domain already has an active marketplace listing request.");

  const provider = getDomainProvider();
  if (!provider.isConfigured()) throw new Error("Marketplace verification is temporarily unavailable.");
  const info = await provider.getDomainInfo(domain.name);
  if (!info?.domain || info.domain.toLowerCase() !== domain.name.toLowerCase()) throw new Error("The registrar could not verify this domain.");

  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "premium_listing_requests"
      ("id","domain_id","seller_user_id","asking_price_cents","currency","category","status","terms_accepted_at")
    VALUES
      (${id},${domain.id},${params.sellerUserId},${Math.round(params.askingPriceCents)},'USD',${params.category?.trim() || null},'SUBMITTED',CURRENT_TIMESTAMP)
  `;
  return { id, domainName: domain.name, askingPriceCents: Math.round(params.askingPriceCents), status: "SUBMITTED" };
}

export async function listSellerPremiumRequests(sellerUserId: string) {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT pr.*, d."name" AS "domainName", pd."status" AS "listingStatus"
    FROM "premium_listing_requests" pr
    JOIN "Domain" d ON d."id"=pr."domain_id"
    LEFT JOIN "PremiumDomain" pd ON pd."id"=pr."premium_domain_id"
    WHERE pr."seller_user_id"=${sellerUserId}
    ORDER BY pr."created_at" DESC
    LIMIT 100
  `;
}

export async function withdrawPremiumListingRequest(requestId: string, sellerUserId: string) {
  const changed = await prisma.$executeRaw`
    UPDATE "premium_listing_requests"
    SET "status"='WITHDRAWN', "updated_at"=CURRENT_TIMESTAMP
    WHERE "id"=${requestId} AND "seller_user_id"=${sellerUserId} AND "status"='SUBMITTED'
  `;
  if (Number(changed) !== 1) throw new Error("This request can no longer be withdrawn.");
}

export async function listPremiumListingRequestsForAdmin() {
  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT pr.*, d."name" AS "domainName", d."status" AS "domainStatus",
           u."email" AS "sellerEmail", u."firstName" AS "sellerFirstName", u."lastName" AS "sellerLastName"
    FROM "premium_listing_requests" pr
    JOIN "Domain" d ON d."id"=pr."domain_id"
    JOIN "User" u ON u."id"=pr."seller_user_id"
    ORDER BY CASE pr."status" WHEN 'SUBMITTED' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END, pr."created_at" DESC
    LIMIT 250
  `;
}

export async function approvePremiumListingRequest(params: {
  requestId: string;
  adminUserId: string;
  commissionBps: number;
  featured?: boolean;
}) {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT pr.*, d."name" AS "domainName", d."userId" AS "domainUserId", d."tldId" AS "tldId"
    FROM "premium_listing_requests" pr
    JOIN "Domain" d ON d."id"=pr."domain_id"
    WHERE pr."id"=${params.requestId}
    LIMIT 1
  `;
  const request = rows[0];
  if (!request || String(request.status) !== "SUBMITTED") throw new Error("This listing request can no longer be approved.");
  if (String(request.seller_user_id) !== String(request.domainUserId)) throw new Error("Domain ownership changed after the seller submitted this request.");
  const commissionBps = Math.min(10000, Math.max(0, Math.round(params.commissionBps)));
  if (commissionBps <= 0) throw new Error("Set a marketplace commission before approving a customer-owned listing.");

  const domain = await prisma.domain.findUnique({ where: { id: String(request.domain_id) }, include: { tld: true } });
  if (!domain || !["ACTIVE", "EXPIRING"].includes(domain.status)) throw new Error("The seller domain is no longer active.");
  const renewal = computeTldPrice(domain.tld).renewCents;
  const asking = Number(request.asking_price_cents);
  const category = request.category ? String(request.category) : undefined;

  let listing = await prisma.premiumDomain.findUnique({ where: { domainName: domain.name } });
  if (listing) {
    listing = await prisma.premiumDomain.update({
      where: { id: listing.id },
      data: { purchasePriceCents: asking, renewalPriceCents: renewal, category, isFeatured: Boolean(params.featured), status: "DELISTED" },
    });
  } else {
    listing = await prisma.premiumDomain.create({
      data: { domainName: domain.name, tldId: domain.tldId, purchasePriceCents: asking, renewalPriceCents: renewal, currency: "USD", category, isFeatured: Boolean(params.featured), status: "DELISTED" },
    });
  }

  await verifyPremiumInventory({
    premiumDomainId: listing.id,
    adminUserId: params.adminUserId,
    source: "CUSTOMER_CUSTODY",
    acquisitionCostCents: null,
    commissionBps,
    autoBuyEnabled: true,
  });

  await prisma.$executeRaw`
    UPDATE "premium_listing_requests"
    SET "status"='APPROVED', "commission_bps"=${commissionBps}, "decided_by_user_id"=${params.adminUserId},
        "decided_at"=CURRENT_TIMESTAMP, "premium_domain_id"=${listing.id}, "updated_at"=CURRENT_TIMESTAMP
    WHERE "id"=${params.requestId} AND "status"='SUBMITTED'
  `;
  return { listingId: listing.id, domainName: domain.name, commissionBps };
}

export async function rejectPremiumListingRequest(params: { requestId: string; adminUserId: string; note?: string | null }) {
  const changed = await prisma.$executeRaw`
    UPDATE "premium_listing_requests"
    SET "status"='REJECTED', "decision_note"=${params.note?.trim().slice(0, 500) || null}, "decided_by_user_id"=${params.adminUserId},
        "decided_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP
    WHERE "id"=${params.requestId} AND "status"='SUBMITTED'
  `;
  if (Number(changed) !== 1) throw new Error("This listing request can no longer be rejected.");
}
