/**
 * Creates the first SUPER_ADMIN account from INITIAL_ADMIN_EMAIL /
 * INITIAL_ADMIN_PASSWORD in the environment. There is no default admin
 * account and no default password shipped with GetSawa (spec section 98) —
 * this script is the only way to create the first admin, and it refuses to
 * run if an admin already exists.
 *
 * Run with: npm run setup:admin
 * Afterwards, remove INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD from your
 * environment — they are only needed once.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be set in your environment to run this script.");
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("INITIAL_ADMIN_PASSWORD must be at least 12 characters.");
    process.exit(1);
  }

  const existingAdmin = await prisma.user.findFirst({ where: { adminRole: "SUPER_ADMIN" } });
  if (existingAdmin) {
    console.error(`A SUPER_ADMIN account already exists (${existingAdmin.email}). Refusing to create another via this script.`);
    console.error("To grant admin access to another account, do it from the database directly or build an internal admin-invite flow.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { adminRole: "SUPER_ADMIN", passwordHash },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      adminRole: "SUPER_ADMIN",
      emailVerifiedAt: new Date(),
      referralCode: crypto.randomBytes(4).toString("hex"),
    },
  });

  console.log(`SUPER_ADMIN account ready: ${admin.email}`);
  console.log("Remove INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD from your environment now.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
