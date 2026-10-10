import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DeyeAccount } from "@/lib/deye/client";

/** The profile's Deye login, or null when none is connected. Never send this to the browser. */
export async function profileDeyeAccount(profileId: string): Promise<DeyeAccount | null> {
  const [p] = await db
    .select({ email: schema.profiles.deyeEmail, passwordHash: schema.profiles.deyePasswordHash })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, profileId));
  return p?.email && p.passwordHash ? { email: p.email, passwordHash: p.passwordHash } : null;
}
