import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPremiumInventoryMeta } from "@/lib/premium-aftermarket";
import { validatePremiumMarketplaceEconomics } from "@/lib/premium-economics";

export class AuctionError extends Error {}

export async function createVerifiedAuction(params: {
  premiumDomainId: string;
  title: string;
  startingBidCents: number;
  reservePriceCents?: number | null;
  minIncrementCents: number;
  startAt: Date;
  endAt: Date;
  extensionSeconds: number;
  isFeatured: boolean;
}) {
  const now = new Date();
  if (!Number.isInteger(params.startingBidCents) || params.startingBidCents <= 0) throw new AuctionError("Starting bid must be greater than zero.");
  if (!Number.isInteger(params.minIncrementCents) || params.minIncrementCents <= 0) throw new AuctionError("Minimum bid increment must be greater than zero.");
  if (params.endAt <= params.startAt) throw new AuctionError("Auction end time must be after the start time.");
  if (params.endAt.getTime() - params.startAt.getTime() < 15 * 60_000) throw new AuctionError("Auction duration must be at least 15 minutes.");
  if (params.endAt.getTime() - params.startAt.getTime() > 30 * 24 * 60 * 60_000) throw new AuctionError("Auction duration cannot exceed 30 days.");
  if (!Number.isInteger(params.extensionSeconds) || params.extensionSeconds < 30 || params.extensionSeconds > 900) throw new AuctionError("Anti-sniping extension must be between 30 and 900 seconds.");

  const listing = await prisma.premiumDomain.findUnique({ where: { id: params.premiumDomainId } });
  if (!listing) throw new AuctionError("Premium inventory not found.");
  if (listing.status !== "LISTED" || listing.isAuction) throw new AuctionError("This premium domain is not available for auction.");
  const meta = await getPremiumInventoryMeta(listing.id);
  if (!meta?.ownershipVerifiedAt || meta.soldAt) throw new AuctionError("Registrar custody must be verified before this domain can be auctioned.");
  if (!["GETSAWA_INVENTORY", "CUSTOMER_CUSTODY"].includes(meta.source)) throw new AuctionError("This inventory source is not eligible for auction.");
  if (meta.reservedUntil && meta.reservedUntil.getTime() > now.getTime()) throw new AuctionError("This domain is currently reserved by a buyer.");

  const protectedSalePrice = params.reservePriceCents && params.reservePriceCents > 0 ? params.reservePriceCents : params.startingBidCents;
  if (params.reservePriceCents != null && params.reservePriceCents < params.startingBidCents) throw new AuctionError("Reserve price cannot be below the starting bid.");
  await validatePremiumMarketplaceEconomics({ source: meta.source as "GETSAWA_INVENTORY" | "CUSTOMER_CUSTODY", salePriceCents: protectedSalePrice, acquisitionCostCents: meta.acquisitionCostCents, commissionBps: meta.commissionBps });

  return prisma.$transaction(async (tx) => {
    const activeLink = await tx.$queryRaw<Array<{ auction_id: string }>>`
      SELECT ai."auction_id" FROM "auction_inventory" ai JOIN "Auction" a ON a."id"=ai."auction_id"
      WHERE ai."premium_domain_id"=${listing.id} AND a."status" IN ('DRAFT','SCHEDULED','LIVE','ENDED','PAID') AND ai."released_at" IS NULL LIMIT 1
    `;
    if (activeLink[0]) throw new AuctionError("This domain already has an active auction lifecycle.");
    const auction = await tx.auction.create({ data: { title: params.title.trim() || listing.domainName, domainName: listing.domainName, startingBidCents: params.startingBidCents, reservePriceCents: params.reservePriceCents || null, minIncrementCents: params.minIncrementCents, startAt: params.startAt, endAt: params.endAt, extensionSeconds: params.extensionSeconds, isFeatured: params.isFeatured, status: params.startAt <= now ? "LIVE" : "SCHEDULED" } });
    await tx.$executeRaw`INSERT INTO "auction_inventory" ("auction_id","premium_domain_id","source","seller_user_id","commission_bps","acquisition_cost_cents") VALUES (${auction.id},${listing.id},${meta.source},${meta.sellerUserId},${meta.commissionBps},${meta.acquisitionCostCents})`;
    await tx.premiumDomain.update({ where: { id: listing.id }, data: { status: "RESERVED", isAuction: true } });
    return auction;
  });
}

export async function getAuctionInventory(auctionId: string) {
  const rows = await prisma.$queryRaw<Array<{ premium_domain_id: string; source: string; seller_user_id: string | null; commission_bps: number; acquisition_cost_cents: number | null; outcome: string | null; released_at: Date | null }>>`SELECT * FROM "auction_inventory" WHERE "auction_id"=${auctionId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function placeBid(auctionId: string, userId: string, amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new AuctionError("Enter a valid bid amount.");
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const [auction, user] = await Promise.all([
          tx.auction.findUnique({ where: { id: auctionId } }),
          tx.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, isSuspended: true, adminRole: true } }),
        ]);
        if (!auction) throw new AuctionError("Auction not found.");
        if (!user || user.isSuspended) throw new AuctionError("Your account is not eligible to bid.");
        if (!user.emailVerifiedAt) throw new AuctionError("Verify your email address before bidding.");
        if (user.adminRole) throw new AuctionError("Administrative accounts cannot participate in public domain auctions.");

        const inventoryRows = await tx.$queryRaw<Array<{ seller_user_id: string | null; released_at: Date | null; premium_domain_id: string }>>`SELECT "seller_user_id","released_at","premium_domain_id" FROM "auction_inventory" WHERE "auction_id"=${auction.id} LIMIT 1`;
        const inventory = inventoryRows[0];
        if (!inventory || inventory.released_at) throw new AuctionError("This auction is not backed by active verified inventory.");
        if (inventory.seller_user_id === userId) throw new AuctionError("You cannot bid on your own domain.");

        const now = new Date();
        if (auction.status !== "LIVE") {
          if (auction.status === "SCHEDULED" && auction.startAt <= now && auction.endAt > now) await tx.auction.update({ where: { id: auction.id }, data: { status: "LIVE" } });
          else throw new AuctionError("This auction is not currently accepting bids.");
        }
        if (auction.endAt <= now) throw new AuctionError("This auction has ended.");
        const highest = await tx.auctionBid.findFirst({ where: { auctionId: auction.id }, orderBy: { amountCents: "desc" } });
        const minimumNext = highest ? highest.amountCents + auction.minIncrementCents : auction.startingBidCents;
        if (amountCents < minimumNext) throw new AuctionError(`Bid must be at least ${(minimumNext / 100).toFixed(2)} USD.`);
        if (highest?.userId === userId) throw new AuctionError("You already have the highest bid.");
        const bid = await tx.auctionBid.create({ data: { auctionId: auction.id, userId, amountCents } });
        const closingWindowMs = auction.extensionSeconds * 1000;
        if (auction.endAt.getTime() - now.getTime() <= closingWindowMs) await tx.auction.update({ where: { id: auction.id }, data: { endAt: new Date(now.getTime() + closingWindowMs) } });
        return bid;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (err: any) {
      const serializationFailure = err?.code === "P2034" || /could not serialize/i.test(err?.message ?? "");
      if (serializationFailure && attempt < MAX_RETRIES - 1) continue;
      throw err;
    }
  }
  throw new AuctionError("Could not place your bid right now. Please try again.");
}

export async function closeAuctionIfExpired(auctionId: string) {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction) return null;
    if (!["LIVE", "SCHEDULED"].includes(auction.status) || auction.endAt > new Date()) return auction;
    const inventoryRows = await tx.$queryRaw<Array<{ premium_domain_id: string; released_at: Date | null }>>`SELECT "premium_domain_id","released_at" FROM "auction_inventory" WHERE "auction_id"=${auction.id} LIMIT 1`;
    const inventory = inventoryRows[0];
    if (!inventory || inventory.released_at) throw new AuctionError("Auction inventory linkage is missing or already released.");
    const highest = await tx.auctionBid.findFirst({ where: { auctionId: auction.id }, orderBy: { amountCents: "desc" } });
    const reserveMet = highest ? (!auction.reservePriceCents || highest.amountCents >= auction.reservePriceCents) : false;
    if (!highest || !reserveMet) {
      await tx.auction.update({ where: { id: auction.id }, data: { status: "ENDED", winningBidId: null, paymentDeadline: null } });
      await tx.premiumDomain.update({ where: { id: inventory.premium_domain_id }, data: { status: "LISTED", isAuction: false } });
      await tx.$executeRaw`UPDATE "auction_inventory" SET "outcome"=${highest ? "RESERVE_NOT_MET" : "NO_BIDS"}, "released_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${auction.id}`;
      return tx.auction.findUnique({ where: { id: auction.id } });
    }

    const paymentDeadline = new Date(Date.now() + 48 * 60 * 60_000);
    const updated = await tx.auction.update({ where: { id: auction.id }, data: { status: "ENDED", winningBidId: highest.id, paymentDeadline } });
    await tx.$executeRaw`UPDATE "premium_inventory_meta" SET "reserved_by_user_id"=${highest.userId}, "reserved_until"=${paymentDeadline}, "updated_at"=CURRENT_TIMESTAMP WHERE "premium_domain_id"=${inventory.premium_domain_id} AND "sold_at" IS NULL`;
    await tx.$executeRaw`INSERT INTO "auction_orders" ("auction_id","winner_user_id","amount_cents","currency","status","payment_deadline") VALUES (${auction.id},${highest.userId},${highest.amountCents},'USD','PAYMENT_PENDING',${paymentDeadline}) ON CONFLICT ("auction_id") DO UPDATE SET "winner_user_id"=EXCLUDED."winner_user_id", "amount_cents"=EXCLUDED."amount_cents", "payment_deadline"=EXCLUDED."payment_deadline", "updated_at"=CURRENT_TIMESTAMP`;
    await tx.notification.create({ data: { userId: highest.userId, type: "AUCTION_WON", title: `You won ${auction.domainName}`, body: `Your winning bid is ${(highest.amountCents / 100).toFixed(2)} USD. Complete payment before ${paymentDeadline.toISOString()} to continue ownership delivery.` } });
    return updated;
  });
}

export async function expireUnpaidAuctionWinners(limit = 200) {
  const rows = await prisma.$queryRaw<Array<{ auction_id: string; premium_domain_id: string; winner_user_id: string; domain_name: string }>>`
    SELECT ao."auction_id", ai."premium_domain_id", ao."winner_user_id", a."domainName" AS domain_name
    FROM "auction_orders" ao JOIN "auction_inventory" ai ON ai."auction_id"=ao."auction_id" JOIN "Auction" a ON a."id"=ao."auction_id"
    WHERE ao."status"='PAYMENT_PENDING' AND ao."payment_deadline" < CURRENT_TIMESTAMP ORDER BY ao."payment_deadline" ASC LIMIT ${limit}
  `;
  let expired = 0;
  for (const row of rows) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`UPDATE "auction_orders" SET "status"='PAYMENT_EXPIRED', "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${row.auction_id} AND "status"='PAYMENT_PENDING'`;
      if (Number(changed) !== 1) return;
      await tx.premiumDomain.update({ where: { id: row.premium_domain_id }, data: { status: "LISTED", isAuction: false } });
      await tx.$executeRaw`UPDATE "premium_inventory_meta" SET "reserved_by_user_id"=NULL, "reserved_until"=NULL, "updated_at"=CURRENT_TIMESTAMP WHERE "premium_domain_id"=${row.premium_domain_id} AND "reserved_by_user_id"=${row.winner_user_id} AND "sold_at" IS NULL`;
      await tx.$executeRaw`UPDATE "auction_inventory" SET "outcome"='WINNER_PAYMENT_EXPIRED', "released_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${row.auction_id}`;
      await tx.notification.create({ data: { userId: row.winner_user_id, type: "AUCTION_PAYMENT_EXPIRED", title: `Payment window expired for ${row.domain_name}`, body: `The winner payment window for ${row.domain_name} expired and the domain has been released from your reservation.` } });
      expired += 1;
    });
  }
  return expired;
}

export async function markAuctionPaymentCreated(params: { auctionId: string; winnerUserId: string; orderId: string; orderItemId: string; providerOrderId: string }) {
  const changed = await prisma.$executeRaw`UPDATE "auction_orders" SET "order_id"=${params.orderId}, "order_item_id"=${params.orderItemId}, "provider_order_id"=${params.providerOrderId}, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${params.auctionId} AND "winner_user_id"=${params.winnerUserId} AND "status"='PAYMENT_PENDING'`;
  if (Number(changed) !== 1) throw new AuctionError("Auction payment record is no longer payable.");
}

export async function markAuctionPaymentCaptured(params: { auctionId: string; orderId: string; captureId: string }) {
  await prisma.$transaction(async (tx) => {
    const changed = await tx.$executeRaw`UPDATE "auction_orders" SET "status"='FULFILLMENT_PENDING', "provider_capture_id"=${params.captureId}, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${params.auctionId} AND "order_id"=${params.orderId} AND "status"='PAYMENT_PENDING'`;
    if (Number(changed) !== 1) throw new AuctionError("Auction payment state could not be advanced.");
    await tx.auction.update({ where: { id: params.auctionId }, data: { status: "PAID" } });
  });
}

export async function markAuctionFulfilled(orderItemId: string, registrarReference: string) {
  const rows = await prisma.$queryRaw<Array<{ auction_id: string }>>`SELECT "auction_id" FROM "auction_orders" WHERE "order_item_id"=${orderItemId} LIMIT 1`;
  const row = rows[0];
  if (!row) return false;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE "auction_orders" SET "status"='COMPLETED', "registrar_reference"=${registrarReference}, "fulfilled_at"=CURRENT_TIMESTAMP, "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${row.auction_id}`;
    await tx.$executeRaw`UPDATE "auction_inventory" SET "outcome"='SOLD', "updated_at"=CURRENT_TIMESTAMP WHERE "auction_id"=${row.auction_id}`;
    await tx.auction.update({ where: { id: row.auction_id }, data: { status: "COMPLETED" } });
  });
  return true;
}
