"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertProfileAccess, requireUser } from "@/lib/session";
import { errorMessage, type ActionResult } from "@/lib/action-result";

const decimal = (label: string, max = 1_000_000) =>
  z.coerce.number({ error: `${label}: enter a number` }).min(0, `${label} can't be negative`).max(max, `${label} is too large`);

const meterSchema = z.object({
  meterNo: z.string().trim().min(1, "Meter number is required"),
  label: z
    .string()
    .trim()
    .transform((v) => v || null),
  utility: z
    .string()
    .trim()
    .transform((v) => v || null),
  connectionType: z.enum(["prepaid", "postpaid"]),
  tariffPlanId: z.uuid("Pick a tariff plan"),
  sanctionedLoadKw: decimal("Sanctioned load", 10_000),
  meterRent: decimal("Meter rent"),
  rebatePercent: decimal("Rebate", 100),
  billingCycleDay: z.coerce.number().int().min(1, "Cycle day must be 1–28").max(28, "Cycle day must be 1–28"),
});

function toRow(v: z.infer<typeof meterSchema>) {
  return {
    ...v,
    sanctionedLoadKw: v.sanctionedLoadKw.toString(),
    meterRent: v.meterRent.toString(),
    rebatePercent: v.rebatePercent.toString(),
  };
}

function friendly(e: unknown) {
  const msg = errorMessage(e);
  return msg.includes("meters_meter_no_uq") ? "Another meter already has that number" : msg;
}

export async function createMeter(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const profileId = String(formData.get("profileId"));
  const parsed = meterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await assertProfileAccess(user, profileId);
    await db.insert(schema.meters).values({ ...toRow(parsed.data), profileId });
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Added meter ${parsed.data.meterNo}` };
}

async function meterProfile(meterId: string) {
  const [m] = await db.select({ profileId: schema.meters.profileId }).from(schema.meters).where(eq(schema.meters.id, meterId));
  if (!m) throw new Error("Meter not found");
  return m.profileId;
}

export async function updateMeter(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const meterId = String(formData.get("meterId"));
  const parsed = meterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await assertProfileAccess(user, await meterProfile(meterId));
    await db.update(schema.meters).set(toRow(parsed.data)).where(eq(schema.meters.id, meterId));
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

export async function deleteMeter(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const meterId = String(formData.get("meterId"));
  try {
    await assertProfileAccess(user, await meterProfile(meterId));
    const devices = await db.select({ id: schema.devices.id }).from(schema.devices).where(eq(schema.devices.meterId, meterId));
    if (devices.length) return { ok: false, message: "Move or delete this meter's devices first" };
    await db.delete(schema.meters).where(eq(schema.meters.id, meterId));
  } catch (e) {
    return { ok: false, message: friendly(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Meter deleted" };
}
