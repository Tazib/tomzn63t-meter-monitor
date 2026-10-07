// Creates the first super admin from SEED_ADMIN_* env vars. Safe to re-run.
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";
import { auth } from "../src/lib/auth";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Super Admin";
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env");

  const existing = await db.select().from(schema.user).where(eq(schema.user.email, email));
  if (existing.length) {
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.email, email));
    console.log(`${email} already exists — ensured it is a super admin.`);
    return;
  }

  await auth.api.createUser({ body: { email, password, name, role: "admin" } });
  console.log(`Created super admin ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
