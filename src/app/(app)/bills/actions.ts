"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperAdmin } from "@/lib/session";
import { errorMessage, type ActionResult } from "@/lib/action-result";
import { finalizeBills, meterBill } from "@/lib/billing-data";

/** The poller does this on its own; this is for after fixing a tariff or usage. */
export async function finalizeNow(): Promise<ActionResult> {
  await requireSuperAdmin();
  try {
    const n = await finalizeBills();
    revalidatePath("/bills");
    return { ok: true, message: n ? `Stored ${n} bill${n === 1 ? "" : "s"}` : "No finished cycles waiting" };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/** Recomputes a stored bill from current data, e.g. after correcting the tariff or meter charges. */
export async function recalculateBill(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const billId = String(formData.get("billId"));
  try {
    const [bill] = await db.select().from(schema.bills).where(eq(schema.bills.id, billId));
    if (!bill) return { ok: false, message: "Bill not found" };
    const [meter] = await db.select().from(schema.meters).where(eq(schema.meters.id, bill.meterId));
    const result = await meterBill(meter, { start: bill.periodStart, end: bill.periodEnd });
    if (!result) return { ok: false, message: "This meter's tariff plan has no rates" };
    await db
      .update(schema.bills)
      .set({
        tariffVersionId: result.tariffVersionId,
        kwh: result.kwh.toFixed(3),
        total: result.bill.total.toFixed(2),
        breakdown: { ...result.bill, partialFrom: result.partialFrom, adjustmentKwh: result.adjustmentKwh },
        solarKwh: result.solar?.outputKwh.toFixed(3) ?? null,
        solarSaving: result.solar?.saving.toFixed(2) ?? null,
        finalizedAt: new Date(),
      })
      .where(eq(schema.bills.id, billId));
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
  revalidatePath("/bills");
  return { ok: true, message: "Recalculated" };
}
