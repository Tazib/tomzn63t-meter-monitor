"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/session";
import { errorMessage, type ActionResult } from "@/lib/action-result";

const optionalText = z
  .string()
  .trim()
  .transform((v) => v || null);

// ---------------------------------------------------------------- users

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["user", "admin"]),
  profileId: optionalText,
});

export async function createUser(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { name, email, password, role, profileId } = parsed.data;

  try {
    const { user } = await auth.api.createUser({
      body: { name, email, password, role },
      headers: await headers(),
    });
    if (profileId) {
      await db.insert(schema.profileMembers).values({ profileId, userId: user.id });
    }
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Created ${email}` };
}

export async function setUserPassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const userId = String(formData.get("userId"));
  const newPassword = String(formData.get("password") ?? "");
  if (newPassword.length < 8) return { ok: false, message: "Password must be at least 8 characters" };
  try {
    await auth.api.setUserPassword({ body: { userId, newPassword }, headers: await headers() });
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  return { ok: true, message: "Password updated" };
}

export async function deleteUser(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  const userId = String(formData.get("userId"));
  if (userId === me.id) return { ok: false, message: "You can't delete your own account" };
  try {
    await auth.api.removeUser({ body: { userId }, headers: await headers() });
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "User deleted" };
}

// ---------------------------------------------------------------- profiles

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  tuyaUid: optionalText,
});

export async function createProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  await db.insert(schema.profiles).values(parsed.data);
  revalidatePath("/admin", "layout");
  return { ok: true, message: `Created profile ${parsed.data.name}` };
}

export async function updateProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = String(formData.get("profileId"));
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  await db.update(schema.profiles).set(parsed.data).where(eq(schema.profiles.id, id));
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

export async function deleteProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = String(formData.get("profileId"));
  try {
    await db.delete(schema.profiles).where(eq(schema.profiles.id, id));
  } catch {
    return { ok: false, message: "Remove this profile's devices first" };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile deleted" };
}

export async function addMember(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const profileId = String(formData.get("profileId"));
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { ok: false, message: "Pick a user" };
  await db.insert(schema.profileMembers).values({ profileId, userId }).onConflictDoNothing();
  revalidatePath("/", "layout");
  return { ok: true, message: "Member added" };
}

export async function removeMember(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const profileId = String(formData.get("profileId"));
  const userId = String(formData.get("userId"));
  await db
    .delete(schema.profileMembers)
    .where(and(eq(schema.profileMembers.profileId, profileId), eq(schema.profileMembers.userId, userId)));
  revalidatePath("/", "layout");
  return { ok: true, message: "Member removed" };
}
