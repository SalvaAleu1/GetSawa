import { Pool } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  neonPool?: Pool;
};

function createPrismaClient() {
  const log = process.env.NODE_ENV === "development" ? (["warn", "error"] as const) : (["error"] as const);
  const connectionString = process.env.DATABASE_URL;

  // CI production builds can import server modules without a database URL.
  // In that build-only case, keep the ordinary client so Prisma can generate
  // route metadata. Cloudflare runtime receives DATABASE_URL as a Worker secret
  // and uses the Neon serverless adapter below.
  if (!connectionString) {
    return new PrismaClient({ log: [...log] });
  }

  const pool = globalForPrisma.neonPool ?? new Pool({ connectionString });
  const adapter = new PrismaNeon(pool);
  const client = new PrismaClient({ adapter, log: [...log] });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.neonPool = pool;
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
