/**
 * Seed script — populates only safe, non-financial baseline configuration:
 * a starter set of TLDs (inactive by default) and nothing else. It never
 * creates fake customers, orders, payments, or domains (spec section 97).
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STARTER_TLDS = [
  // Launch-safe with the current NameSilo API: classic registrations do not
  // depend on an exact registry-premium quote.
  { extension: "com", markupPercent: 25, supportsPremium: false },
  { extension: "net", markupPercent: 25, supportsPremium: false },
  { extension: "org", markupPercent: 25, supportsPremium: false },

  // Keep premium-capable extensions fail-closed until CloudSawa has a
  // registrar path that can quote the exact registry-premium amount before
  // payment. They remain seeded but inactive by default.
  { extension: "app", markupPercent: 30, supportsPremium: true },
  { extension: "dev", markupPercent: 30, supportsPremium: true },
  { extension: "co", markupPercent: 30, supportsPremium: true },
  { extension: "africa", markupPercent: 20, supportsPremium: true },
  { extension: "io", markupPercent: 35, supportsPremium: true },
];

async function main() {
  console.log("Seeding baseline TLD configuration (inactive — activate and set wholesale costs from Admin → TLD Manager once NameSilo is connected)...");

  for (const t of STARTER_TLDS) {
    await prisma.tld.upsert({
      where: { extension: t.extension },
      update: {},
      create: {
        extension: t.extension,
        isActive: false, // admin must explicitly activate after confirming pricing
        pricingMethod: "WHOLESALE_PLUS_PERCENT",
        markupPercent: t.markupPercent,
        supportsPremium: t.supportsPremium,
        currency: "USD",
      },
    });
  }

  console.log("Seed complete. No customers, orders, or payments were created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
