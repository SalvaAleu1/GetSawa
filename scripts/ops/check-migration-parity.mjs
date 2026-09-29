import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const migrationsDir = path.join(root, "prisma", "migrations");

const committed = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
  .map((entry) => entry.name)
  .sort();

const prisma = new PrismaClient();

try {
  const appliedRows = await prisma.$queryRawUnsafe(
    'SELECT "migration_name" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL AND "finished_at" IS NOT NULL ORDER BY "migration_name" ASC',
  );
  const applied = appliedRows.map((row) => String(row.migration_name)).sort();

  const missing = committed.filter((name) => !applied.includes(name));
  const unexpected = applied.filter((name) => !committed.includes(name));

  if (missing.length || unexpected.length) {
    console.error("Database migration parity check failed.");
    if (missing.length) console.error(`Unapplied committed migrations: ${missing.join(", ")}`);
    if (unexpected.length) console.error(`Applied migrations not present in this checkout: ${unexpected.join(", ")}`);
    process.exit(1);
  }

  console.log(`Database migration parity verified: ${committed.length} committed migrations are applied.`);
} finally {
  await prisma.$disconnect();
}
