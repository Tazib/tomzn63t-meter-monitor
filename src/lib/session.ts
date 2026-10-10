import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

export function isSuperAdmin(user: { role?: string | null }) {
  return user.role === "admin";
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!isSuperAdmin(user)) redirect("/");
  return user;
}

/** Profiles the user may see: all for a super admin, otherwise their memberships. */
// Never the Deye password hash: these rows reach pages.
const profileColumns = {
  id: schema.profiles.id,
  name: schema.profiles.name,
  tuyaUid: schema.profiles.tuyaUid,
  deyeEmail: schema.profiles.deyeEmail,
  createdAt: schema.profiles.createdAt,
};

export async function accessibleProfiles(user: { id: string; role?: string | null }) {
  if (isSuperAdmin(user)) {
    return db.select(profileColumns).from(schema.profiles).orderBy(schema.profiles.name);
  }
  return db
    .select(profileColumns)
    .from(schema.profiles)
    .innerJoin(schema.profileMembers, eq(schema.profileMembers.profileId, schema.profiles.id))
    .where(eq(schema.profileMembers.userId, user.id))
    .orderBy(schema.profiles.name);
}

/** Throws unless the user may manage the given profile. Use inside every Server Action. */
export async function assertProfileAccess(user: { id: string; role?: string | null }, profileId: string) {
  const profiles = await accessibleProfiles(user);
  if (!profiles.some((p) => p.id === profileId)) throw new Error("Not allowed");
}
