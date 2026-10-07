// Loads tariffs and usage from the database and turns them into bills.
// No "server-only" so the poller can finalise bills too.
import { and, asc, between, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, computeBill, cycleFor, daysBetween, type Bill, type Cycle, type MeterCharges, type Tariff } from "@/lib/billing";
import { dhakaDay } from "@/lib/energy";

export type Meter = typeof schema.meters.$inferSelect;
export type TariffVersion = typeof schema.tariffVersions.$inferSelect;

/** The tariff version in force on `day` (falls back to the earliest one). */
export async function tariffFor(planId: string, day: string): Promise<{ version: TariffVersion; tariff: Tariff } | null> {
  const [version] = await db
    .select()
    .from(schema.tariffVersions)
    .where(and(eq(schema.tariffVersions.planId, planId), lte(schema.tariffVersions.effectiveFrom, day)))
    .orderBy(desc(schema.tariffVersions.effectiveFrom))
    .limit(1);
  const chosen =
    version ??
    (
      await db
        .select()
        .from(schema.tariffVersions)
        .where(eq(schema.tariffVersions.planId, planId))
        .orderBy(asc(schema.tariffVersions.effectiveFrom))
        .limit(1)
    )[0];
  if (!chosen) return null;

  const slabs = await db
    .select()
    .from(schema.tariffSlabs)
    .where(eq(schema.tariffSlabs.versionId, chosen.id))
    .orderBy(asc(schema.tariffSlabs.fromKwh));

  return { version: chosen, tariff: toTariff(chosen, slabs) };
}

export function toTariff(v: TariffVersion, slabs: (typeof schema.tariffSlabs.$inferSelect)[]): Tariff {
  return {
    lifelineMaxKwh: v.lifelineMaxKwh === null ? null : Number(v.lifelineMaxKwh),
    lifelineRate: v.lifelineRate === null ? null : Number(v.lifelineRate),
    demandChargePerKw: Number(v.demandChargePerKw),
    vatPercent: Number(v.vatPercent),
    slabs: slabs
      .map((s) => ({ fromKwh: Number(s.fromKwh), toKwh: s.toKwh === null ? null : Number(s.toKwh), rate: Number(s.rate) }))
      .sort((a, b) => a.fromKwh - b.fromKwh),
  };
}

export function meterCharges(m: Meter): MeterCharges {
  return {
    sanctionedLoadKw: Number(m.sanctionedLoadKw),
    meterRent: Number(m.meterRent),
    rebatePercent: Number(m.rebatePercent),
  };
}

/** kWh per device between two days (inclusive). */
export async function deviceKwh(deviceIds: string[], start: string, end: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (deviceIds.length === 0) return out;
  const rows = await db
    .select({ deviceId: schema.dailyEnergy.deviceId, kwh: sql<string>`sum(${schema.dailyEnergy.kwh})` })
    .from(schema.dailyEnergy)
    .where(and(inArray(schema.dailyEnergy.deviceId, deviceIds), between(schema.dailyEnergy.day, start, end)))
    .groupBy(schema.dailyEnergy.deviceId);
  for (const r of rows) out.set(r.deviceId, Number(r.kwh));
  return out;
}

export type SolarResult = { outputKwh: number; inputKwh: number; billWithoutSolar: Bill; saving: number };

export type MeterBill = {
  cycle: Cycle;
  kwh: number;
  bill: Bill;
  tariffVersionId: string;
  solar: SolarResult | null;
  /** First day any of this meter's devices was tracked; set only when that is after the cycle start. */
  partialFrom: string | null;
};

/** What a stored bill's breakdown JSON holds. */
export type StoredBreakdown = Bill & { partialFrom?: string | null };

/**
 * Bill for one meter over a cycle.
 * Meter kWh = sum of its grid devices. Solar saving =
 *   bill(meter kWh − inverter input + inverter output) − bill(meter kWh)
 * i.e. what the inverter's loads would have cost straight from the grid.
 */
export async function meterBill(meter: Meter, cycle: Cycle, endOverride?: string): Promise<MeterBill | null> {
  const t = await tariffFor(meter.tariffPlanId, cycle.start);
  if (!t) return null;
  const end = endOverride ?? cycle.end;

  const meterDevices = await db.select().from(schema.devices).where(eq(schema.devices.meterId, meter.id));
  const grid = meterDevices.filter((d) => d.source === "grid");
  const solar = meterDevices.filter((d) => d.source === "solar");
  const inputIds = solar.map((d) => d.inverterInputDeviceId).filter((id): id is string => !!id);

  const usage = await deviceKwh([...grid.map((d) => d.id), ...solar.map((d) => d.id), ...inputIds], cycle.start, end);
  const sum = (ids: string[]) => ids.reduce((s, id) => s + (usage.get(id) ?? 0), 0);

  const kwh = sum(grid.map((d) => d.id));
  const charges = meterCharges(meter);
  const bill = computeBill(kwh, t.tariff, charges);

  let solarResult: SolarResult | null = null;
  if (solar.length) {
    const outputKwh = sum(solar.map((d) => d.id));
    const inputKwh = sum(inputIds);
    const billWithoutSolar = computeBill(kwh - inputKwh + outputKwh, t.tariff, charges);
    solarResult = { outputKwh, inputKwh, billWithoutSolar, saving: Math.round((billWithoutSolar.total - bill.total) * 100) / 100 };
  }

  const firstTracked = meterDevices.length
    ? dhakaDay(new Date(Math.min(...meterDevices.map((d) => d.createdAt.getTime()))))
    : null;
  const partialFrom = firstTracked && firstTracked > cycle.start ? firstTracked : null;

  return { cycle: { start: cycle.start, end }, kwh, bill, tariffVersionId: t.version.id, solar: solarResult, partialFrom };
}

export type Projection = MeterBill & { daysElapsed: number; daysInCycle: number; projectedKwh: number; projected: Bill };

/** Current cycle so far, plus a straight-line projection to the cycle end. */
export async function currentCycleBill(meter: Meter, now = new Date()): Promise<Projection | null> {
  const today = dhakaDay(now);
  const cycle = cycleFor(today, meter.billingCycleDay);
  const soFar = await meterBill(meter, cycle, today);
  if (!soFar) return null;

  const t = (await tariffFor(meter.tariffPlanId, cycle.start))!;
  const daysInCycle = daysBetween(cycle.start, cycle.end);
  // Count today as a partial day so early-morning projections aren't wildly high.
  const hoursToday = (now.getTime() - Date.parse(`${today}T00:00:00+06:00`)) / 3_600_000;
  const daysElapsed = Math.max(daysBetween(cycle.start, today) - 1 + hoursToday / 24, 0.25);
  const projectedKwh = (soFar.kwh / daysElapsed) * daysInCycle;

  return {
    ...soFar,
    cycle,
    daysElapsed,
    daysInCycle,
    projectedKwh,
    projected: computeBill(projectedKwh, t.tariff, meterCharges(meter)),
  };
}

/**
 * Stores bills for cycles that have ended and have usage but no stored bill yet.
 * Looks back a few cycles so a poller outage doesn't skip a month.
 */
export async function finalizeBills(now = new Date()): Promise<number> {
  const today = dhakaDay(now);
  const meters = await db.select().from(schema.meters);
  let stored = 0;

  for (const meter of meters) {
    let cycle = cycleFor(today, meter.billingCycleDay);
    for (let i = 0; i < 3; i++) {
      cycle = cycleFor(addDays(cycle.start, -1), meter.billingCycleDay);
      const [existing] = await db
        .select({ id: schema.bills.id })
        .from(schema.bills)
        .where(and(eq(schema.bills.meterId, meter.id), eq(schema.bills.periodStart, cycle.start)));
      if (existing) break;

      const result = await meterBill(meter, cycle);
      if (!result || !(await hasUsage(meter.id, cycle))) continue;

      await db
        .insert(schema.bills)
        .values({
          meterId: meter.id,
          periodStart: cycle.start,
          periodEnd: cycle.end,
          tariffVersionId: result.tariffVersionId,
          kwh: result.kwh.toFixed(3),
          total: result.bill.total.toFixed(2),
          breakdown: { ...result.bill, partialFrom: result.partialFrom } satisfies StoredBreakdown,
          solarKwh: result.solar?.outputKwh.toFixed(3),
          solarSaving: result.solar?.saving.toFixed(2),
        })
        .onConflictDoNothing();
      stored++;
    }
  }
  return stored;
}

async function hasUsage(meterId: string, cycle: Cycle) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.dailyEnergy)
    .innerJoin(schema.devices, eq(schema.devices.id, schema.dailyEnergy.deviceId))
    .where(and(eq(schema.devices.meterId, meterId), between(schema.dailyEnergy.day, cycle.start, cycle.end)));
  return (row?.n ?? 0) > 0;
}
