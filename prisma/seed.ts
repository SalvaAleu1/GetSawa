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
  { extension: "com", markupPercent: 25 },
  { extension: "net", markupPercent: 25 },
  { extension: "org", markupPercent: 25 },
  { extension: "app", markupPercent: 30 },
  { extension: "dev", markupPercent: 30 },
  { extension: "co", markupPercent: 30 },
  { extension: "africa", markupPercent: 20 },
  { extension: "io", markupPercent: 35 },
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
