import { NextRequest } from "next/server";
import { jsonOk, handleError } from "@/lib/api";
import { listPublicPremiumDomains, type PremiumInventorySource } from "@/lib/premium-aftermarket";

const PUBLIC_SOURCES = new Set<PremiumInventorySource>(["GETSAWA_INVENTORY", "CUSTOMER_CUSTODY"]);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const rawSource = url.searchParams.get("source") as PremiumInventorySource | null;
    const source = rawSource && PUBLIC_SOURCES.has(rawSource) ? rawSource : undefined;
    const featuredRaw = url.searchParams.get("featured");
    const featured = featuredRaw === "1" ? true : featuredRaw === "0" ? false : undefined;
    const min = parseCents(url.searchParams.get("minPrice"));
    const max = parseCents(url.searchParams.get("maxPrice"));
    const listings = await listPublicPremiumDomains({ q, category, source, featured, minPriceCents: min, maxPriceCents: max, limit: 100 });
    const categories = [...new Set(listings.map((item) => item.category).filter((value): value is string => Boolean(value)))].sort();
    return jsonOk({ listings, categories });
  } catch (err) {
    return handleError(err);
  }
}

function parseCents(value: string | null) {
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.round(number * 100);
}
