"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireSuperAdmin } from "@/lib/session";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { SLAB_ROWS } from "@/lib/billing";

const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Numbers must be 0 or more");

const requiredNumber = z.coerce.number({ error: "Enter a number" }).min(0, "Numbers must be 0 or more");

const planSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z
    .string()
    .trim()
    .transform((v) => v || null),
});

export async function createPlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  await db.insert(schema.tariffPlans).values({ ...parsed.data, createdBy: user.id });
  revalidatePath("/tariffs");
  return { ok: true, message: `Created ${parsed.data.name}. Now add its rates.` };
}

export async function updatePlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = String(formData.get("planId"));
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  await db.update(schema.tariffPlans).set(parsed.data).where(eq(schema.tariffPlans.id, id));
  revalidatePath("/tariffs");
  return { ok: true, message: "Saved" };
}

export async function deletePlan(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = String(formData.get("planId"));
  try {
    await db.delete(schema.tariffPlans).where(eq(schema.tariffPlans.id, id));
  } catch {
    return { ok: false, message: "Meters still use this plan. Move them to another plan first." };
  }
  revalidatePath("/tariffs");
  return { ok: true, message: "Plan deleted" };
}

const versionSchema = z.object({
  planId: z.uuid(),
  effectiveFrom: z.iso.date("Pick the date the rates start"),
  lifelineMaxKwh: optionalNumber,
  lifelineRate: optionalNumber,
  demandChargePerKw: requiredNumber,
  vatPercent: requiredNumber.max(100),
});

/** Reads slab rows "upTo-i" / "rate-i". A blank upTo on the last row means no upper limit. */
function parseSlabs(formData: FormData) {
  const rows: { upTo: number | null; rate: number }[] = [];
  for (let i = 0; i < SLAB_ROWS; i++) {
    const rate = String(formData.get(`rate-${i}`) ?? "").trim();
    const upTo = String(formData.get(`upTo-${i}`) ?? "").trim();
    if (rate === "" && upTo === "") continue;
    if (rate === "" || !Number.isFinite(Number(rate))) throw new Error(`Slab ${rows.length + 1}: enter a rate`);
    if (upTo !== "" && !Number.isFinite(Number(upTo))) throw new Error(`Slab ${rows.length + 1}: "up to" must be a number`);
    rows.push({ upTo: upTo === "" ? null : Number(upTo), rate: Number(rate) });
  }
  if (rows.length === 0) throw new Error("Add at least one slab");

  let from = 0;
  return rows.map((r, i) => {
    const last = i === rows.length - 1;
    if (r.upTo === null && !last) throw new Error(`Only the last slab can have no upper limit`);
    if (r.upTo !== null && r.upTo <= from) throw new Error(`Slab ${i + 1}: "up to" must be more than ${from}`);
    const slab = { fromKwh: from, toKwh: r.upTo, rate: r.rate };
    if (r.upTo !== null) from = r.upTo;
    return slab;
  });
}

export async function addVersion(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = versionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const v = parsed.data;
  if ((v.lifelineMaxKwh === null) !== (v.lifelineRate === null)) {
    return { ok: false, message: "Fill both lifeline fields, or leave both empty" };
  }

  try {
    const slabs = parseSlabs(formData);
    await db.transaction(async (tx) => {
      const [version] = await tx
        .insert(schema.tariffVersions)
        .values({
          planId: v.planId,
          effectiveFrom: v.effectiveFrom,
          lifelineMaxKwh: v.lifelineMaxKwh?.toString() ?? null,
          lifelineRate: v.lifelineRate?.toString() ?? null,
          demandChargePerKw: v.demandChargePerKw.toString(),
          vatPercent: v.vatPercent.toString(),
        })
        .returning();
      await tx.insert(schema.tariffSlabs).values(
        slabs.map((s) => ({
          versionId: version.id,
          fromKwh: s.fromKwh.toString(),
          toKwh: s.toKwh?.toString() ?? null,
          rate: s.rate.toString(),
        })),
      );
    });
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.includes("tariff_versions_plan_effective_uq")) {
      return { ok: false, message: "This plan already has rates starting on that date" };
    }
    return { ok: false, message: msg };
  }
  revalidatePath("/tariffs");
  return { ok: true, message: `Rates from ${v.effectiveFrom} saved` };
}

export async function deleteVersion(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = String(formData.get("versionId"));
  const planId = String(formData.get("planId"));
  const versions = await db.select({ id: schema.tariffVersions.id }).from(schema.tariffVersions).where(eq(schema.tariffVersions.planId, planId));
  if (versions.length <= 1) return { ok: false, message: "A plan needs at least one set of rates" };
  await db.delete(schema.tariffVersions).where(eq(schema.tariffVersions.id, id));
  revalidatePath("/tariffs");
  return { ok: true, message: "Rates deleted" };
}
