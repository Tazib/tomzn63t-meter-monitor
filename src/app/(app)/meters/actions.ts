"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertProfileAccess, requireUser } from "@/lib/session";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { setCycleUsage, setPrepaidBalance } from "@/lib/billing-data";

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

/** "Units used this cycle so far": empty = none, otherwise a non-negative number. */
const cycleUsage = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v < 100_000), "Units this cycle must be a number of kWh");

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
  const usage = cycleUsage.safeParse(String(formData.get("cycleUsageKwh") ?? ""));
  if (!usage.success) return { ok: false, message: usage.error.issues[0].message };
  try {
    await assertProfileAccess(user, profileId);
    const [meter] = await db
      .insert(schema.meters)
      .values({ ...toRow(parsed.data), profileId })
      .returning({ id: schema.meters.id });
    if (usage.data !== null) await setCycleUsage(meter.id, parsed.data.billingCycleDay, usage.data);
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
  const raw = String(formData.get("cycleUsageKwh") ?? "").trim();
  const usage = cycleUsage.safeParse(raw);
  if (!usage.success) return { ok: false, message: usage.error.issues[0].message };
  try {
    await assertProfileAccess(user, await meterProfile(meterId));
    const [before] = await db
      .select({ cycleDay: schema.meters.billingCycleDay })
      .from(schema.meters)
      .where(eq(schema.meters.id, meterId));
    await db.update(schema.meters).set(toRow(parsed.data)).where(eq(schema.meters.id, meterId));
    // Only touch the entered units when the field was changed (or the cycle moved), so saving
    // other settings doesn't re-anchor it to the latest breaker readings.
    const changed = raw !== String(formData.get("cycleUsageOriginal") ?? "").trim();
    if (changed || before.cycleDay !== parsed.data.billingCycleDay) {
      await setCycleUsage(meterId, parsed.data.billingCycleDay, usage.data);
    }
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

// ---------------------------------------------------------------- prepaid balance & recharges

async function meterForUser(user: { id: string; role?: string | null }, meterId: string) {
  const [meter] = await db.select().from(schema.meters).where(eq(schema.meters.id, meterId));
  if (!meter) throw new Error("Meter not found");
  await assertProfileAccess(user, meter.profileId);
  return meter;
}

const money = (label: string) =>
  z.coerce.number({ error: `${label}: enter an amount in Tk` }).min(-100_000).max(1_000_000, `${label} is too large`);

export async function setBalance(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({ meterId: z.uuid(), balanceTk: money("Balance") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    const meter = await meterForUser(user, parsed.data.meterId);
    await setPrepaidBalance(meter, parsed.data.balanceTk);
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Balance saved. From now on it goes down with usage and up with recharges." };
}

const rechargeSchema = z.object({
  meterId: z.uuid(),
  amountTk: money("Recharge").refine((v) => v > 0, "Recharge must be more than 0"),
  // <input type="datetime-local"> gives wall-clock time; it means Dhaka time.
  at: z
    .string()
    .trim()
    .transform((v) => (v ? new Date(`${v.length === 16 ? `${v}:00` : v}+06:00`) : new Date()))
    .refine((d) => !Number.isNaN(d.getTime()), "Pick when you recharged")
    .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, "That time is in the future"),
});

export async function addRecharge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = rechargeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await meterForUser(user, parsed.data.meterId);
    await db.insert(schema.meterRecharges).values({
      meterId: parsed.data.meterId,
      amountTk: parsed.data.amountTk.toFixed(2),
      at: parsed.data.at,
      createdBy: user.id,
    });
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Recharge of ৳${parsed.data.amountTk} added` };
}

export async function deleteRecharge(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const id = String(formData.get("rechargeId"));
  try {
    const [r] = await db.select().from(schema.meterRecharges).where(eq(schema.meterRecharges.id, id));
    if (!r) return { ok: false, message: "Recharge not found" };
    await meterForUser(user, r.meterId);
    await db.delete(schema.meterRecharges).where(eq(schema.meterRecharges.id, id));
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Recharge removed" };
}
