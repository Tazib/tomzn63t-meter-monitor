import "server-only";
import { and, between, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, allocateCost, nextPriceStep, type CostShare, type Tariff } from "@/lib/billing";
import { currentCycleBill, deviceKwh, meterCharges, prepaidBalance, tariffFor, type PrepaidBalance, type Projection } from "@/lib/billing-data";
import { dhakaDay } from "@/lib/energy";

type Device = typeof schema.devices.$inferSelect;
type Meter = typeof schema.meters.$inferSelect;
type Reading = typeof schema.readings.$inferSelect;

// A reading older than this is not "live".
const LIVE_WINDOW_MS = 5 * 60_000;
const BUCKET_SECONDS = 300;

export type DayPoint = { day: string; grid: number; solar: number };
export type PowerPoint = { ts: number; grid: number | null; solar: number | null };

export type MeterDashboard = {
  meter: Meter;
  devices: (Device & { live: Reading | null; todayKwh: number })[];
  liveGridW: number | null;
  liveSolarW: number | null;
  todayGridKwh: number;
  todaySolarKwh: number;
  cycle: Projection | null;
  tariff: Tariff | null;
  nextStep: ReturnType<typeof nextPriceStep>;
  balance: PrepaidBalance | null;
  /** This cycle's bill split by breaker (plus entered units); fixed charges separately. */
  costs: { fixed: number; shares: CostShare[] } | null;
  daily: DayPoint[];
  monthly: { month: string; grid: number; solar: number }[];
  power: PowerPoint[];
};

export async function profileDashboard(profileId: string, now = new Date()): Promise<MeterDashboard[]> {
  const meters = await db.select().from(schema.meters).where(eq(schema.meters.profileId, profileId)).orderBy(schema.meters.meterNo);
  if (meters.length === 0) return [];
  const devices = await db
    .select()
    .from(schema.devices)
    .where(inArray(schema.devices.meterId, meters.map((m) => m.id)))
    .orderBy(schema.devices.name);
  const ids = devices.map((d) => d.id);

  const today = dhakaDay(now);
  const dayStart = new Date(`${today}T00:00:00+06:00`);
  const from30 = addDays(today, -29);
  const from12m = `${addDays(`${today.slice(0, 7)}-01`, -320).slice(0, 7)}-01`;

  const [latest, daily, monthly, power] = ids.length
    ? await Promise.all([
        db
          .selectDistinctOn([schema.readings.deviceId])
          .from(schema.readings)
          .where(and(inArray(schema.readings.deviceId, ids), gte(schema.readings.ts, new Date(now.getTime() - 86_400_000))))
          .orderBy(schema.readings.deviceId, desc(schema.readings.ts)),
        db
          .select({ deviceId: schema.dailyEnergy.deviceId, day: schema.dailyEnergy.day, kwh: schema.dailyEnergy.kwh })
          .from(schema.dailyEnergy)
          .where(and(inArray(schema.dailyEnergy.deviceId, ids), between(schema.dailyEnergy.day, from30, today))),
        db
          .select({
            deviceId: schema.dailyEnergy.deviceId,
            month: sql<string>`to_char(${schema.dailyEnergy.day}, 'YYYY-MM')`,
            kwh: sql<string>`sum(${schema.dailyEnergy.kwh})`,
          })
          .from(schema.dailyEnergy)
          .where(and(inArray(schema.dailyEnergy.deviceId, ids), gte(schema.dailyEnergy.day, from12m)))
          .groupBy(schema.dailyEnergy.deviceId, sql`2`),
        db
          .select({
            deviceId: schema.readings.deviceId,
            bucket: sql<number>`(floor(extract(epoch from ${schema.readings.ts}) / ${sql.raw(String(BUCKET_SECONDS))}) * ${sql.raw(String(BUCKET_SECONDS))})::bigint`,
            powerW: sql<number | null>`avg(${schema.readings.powerW})`,
          })
          .from(schema.readings)
          .where(and(inArray(schema.readings.deviceId, ids), gte(schema.readings.ts, dayStart)))
          .groupBy(schema.readings.deviceId, sql`2`),
      ])
    : [[], [], [], []];

  return Promise.all(
    meters.map(async (meter) => {
      const own = devices.filter((d) => d.meterId === meter.id);
      const isGrid = new Set(own.filter((d) => d.source === "grid").map((d) => d.id));
      const isSolar = new Set(own.filter((d) => d.source === "solar").map((d) => d.id));
      const ownIds = new Set(own.map((d) => d.id));

      const withLive = own.map((d) => {
        const r = latest.find((x) => x.deviceId === d.id) ?? null;
        const live = r && now.getTime() - r.ts.getTime() < LIVE_WINDOW_MS ? r : null;
        const todayKwh = daily.filter((x) => x.deviceId === d.id && x.day === today).reduce((s, x) => s + Number(x.kwh), 0);
        return { ...d, live, todayKwh };
      });

      const livePower = (set: Set<string>) => {
        const rows = withLive.filter((d) => set.has(d.id) && d.live?.powerW != null);
        return rows.length ? rows.reduce((s, d) => s + d.live!.powerW!, 0) : null;
      };

      // Daily series, every day present even when zero.
      const dailyPoints: DayPoint[] = [];
      for (let day = from30; day <= today; day = addDays(day, 1)) {
        const rows = daily.filter((x) => x.day === day && ownIds.has(x.deviceId));
        dailyPoints.push({
          day,
          grid: round(rows.filter((x) => isGrid.has(x.deviceId)).reduce((s, x) => s + Number(x.kwh), 0)),
          solar: round(rows.filter((x) => isSolar.has(x.deviceId)).reduce((s, x) => s + Number(x.kwh), 0)),
        });
      }

      const months: { month: string; grid: number; solar: number }[] = [];
      for (let m = from12m.slice(0, 7); m <= today.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) {
        const rows = monthly.filter((x) => x.month === m && ownIds.has(x.deviceId));
        months.push({
          month: m,
          grid: round(rows.filter((x) => isGrid.has(x.deviceId)).reduce((s, x) => s + Number(x.kwh), 0)),
          solar: round(rows.filter((x) => isSolar.has(x.deviceId)).reduce((s, x) => s + Number(x.kwh), 0)),
        });
      }

      // Power curve: average per device per bucket, summed across devices.
      const buckets = new Map<number, { grid: number | null; solar: number | null }>();
      for (const r of power) {
        if (!ownIds.has(r.deviceId) || r.powerW === null) continue;
        const key = Number(r.bucket) * 1000;
        const b = buckets.get(key) ?? { grid: null, solar: null };
        if (isGrid.has(r.deviceId)) b.grid = (b.grid ?? 0) + Number(r.powerW);
        if (isSolar.has(r.deviceId)) b.solar = (b.solar ?? 0) + Number(r.powerW);
        buckets.set(key, b);
      }
      const powerPoints = [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([ts, b]) => ({ ts, grid: b.grid === null ? null : Math.round(b.grid), solar: b.solar === null ? null : Math.round(b.solar) }));

      const cycle = await currentCycleBill(meter, now);
      const t = cycle ? await tariffFor(meter.tariffPlanId, cycle.cycle.start) : null;

      let costs: MeterDashboard["costs"] = null;
      if (cycle && t) {
        const gridDevices = own.filter((d) => d.source === "grid");
        const used = await deviceKwh(gridDevices.map((d) => d.id), cycle.cycle.start, today);
        costs = allocateCost(cycle.bill, t.tariff, meterCharges(meter), [
          ...gridDevices.map((d) => ({ key: d.id, label: d.name, kwh: used.get(d.id) ?? 0 })),
          ...(cycle.adjustmentKwh ? [{ key: `before-${meter.id}`, label: "Before tracking (entered)", kwh: cycle.adjustmentKwh }] : []),
        ]);
      }
      const balance = meter.connectionType === "prepaid" ? await prepaidBalance(meter, now) : null;

      return {
        meter,
        devices: withLive,
        liveGridW: livePower(isGrid),
        liveSolarW: livePower(isSolar),
        todayGridKwh: round(withLive.filter((d) => isGrid.has(d.id)).reduce((s, d) => s + d.todayKwh, 0)),
        todaySolarKwh: round(withLive.filter((d) => isSolar.has(d.id)).reduce((s, d) => s + d.todayKwh, 0)),
        cycle,
        tariff: t?.tariff ?? null,
        nextStep: cycle && t ? nextPriceStep(cycle.kwh, t.tariff) : null,
        balance,
        costs,
        daily: dailyPoints,
        monthly: months,
        power: powerPoints,
      };
    }),
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------- views
// One shape for both "all meters" and a single meter, so the dashboard renders either the same way.

export type MonthPoint = { month: string; grid: number; solar: number };
export type ViewDevice = MeterDashboard["devices"][number] & { meterLabel: string };

export type Ladder = {
  meterId: string;
  label: string;
  kwh: number;
  projectedKwh: number;
  tariff: Tariff;
  nextStep: ReturnType<typeof nextPriceStep>;
  lifeline: boolean;
  cycleEnd: string;
  daysElapsed: number;
  daysInCycle: number;
  trackedDays: number;
};

export type DashboardView = {
  key: string;
  title: string;
  meterCount: number;
  liveGridW: number | null;
  liveSolarW: number | null;
  lastReadingAt: number | null;
  todayGridKwh: number;
  todaySolarKwh: number;
  /** Rough Tk value of today's grid use at each meter's average rate this cycle. */
  todayCost: number;
  cycleKwh: number;
  billSoFar: number;
  projectedBill: number;
  projectedKwh: number;
  solarCycleKwh: number;
  solarSaving: number;
  hasSolar: boolean;
  hasCycle: boolean;
  /** "day 7 of 31" when every meter shares one cycle, else null. */
  cycleProgress: { day: number; of: number; start: string; end: string } | null;
  partialFrom: string | null;
  /** Average kWh per day since readings began this cycle. */
  dailyAverage: number;
  projectionReliable: boolean;
  /** Highest 5-minute grid power today. */
  peakToday: { w: number; ts: number } | null;
  power: PowerPoint[];
  daily: DayPoint[];
  monthly: MonthPoint[];
  devices: ViewDevice[];
  ladders: Ladder[];
  balances: { meterId: string; label: string; balance: PrepaidBalance }[];
  /** Prepaid meters that don't have a balance entered yet. */
  prepaidWithoutBalance: number;
  costs: { fixed: number; total: number; shares: (CostShare & { meterLabel: string })[] };
};

export function meterLabel(m: Meter) {
  return m.label ?? `Meter ${m.meterNo}`;
}

function avgRate(m: MeterDashboard) {
  const p = m.cycle?.projected;
  return p && p.kwh > 0 ? p.energyCharge / p.kwh : 0;
}

function sumNullable(values: (number | null)[]) {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

/** Combines any number of meters into one view (one meter in = that meter's view). */
export function buildView(key: string, title: string, meters: MeterDashboard[]): DashboardView {
  const cycles = meters.map((m) => m.cycle).filter((c): c is Projection => c !== null);
  const sameCycle =
    cycles.length > 0 && cycles.every((c) => c.cycle.start === cycles[0].cycle.start && c.cycle.end === cycles[0].cycle.end);

  // Power curves line up on 5-minute buckets, so summing by timestamp is exact.
  const power = new Map<number, { grid: number | null; solar: number | null }>();
  for (const m of meters)
    for (const p of m.power) {
      const b = power.get(p.ts) ?? { grid: null, solar: null };
      if (p.grid !== null) b.grid = (b.grid ?? 0) + p.grid;
      if (p.solar !== null) b.solar = (b.solar ?? 0) + p.solar;
      power.set(p.ts, b);
    }

  const sumSeries = <T extends { grid: number; solar: number }>(key: keyof T, series: T[][]) => {
    const out = new Map<string, T>();
    for (const list of series)
      for (const p of list) {
        const k = String(p[key]);
        const prev = out.get(k);
        out.set(k, prev ? { ...prev, grid: round(prev.grid + p.grid), solar: round(prev.solar + p.solar) } : { ...p });
      }
    return [...out.values()].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
  };

  const devices = meters.flatMap((m) => m.devices.map((d) => ({ ...d, meterLabel: meterLabel(m.meter) })));
  const lastReadingAt = devices.reduce<number | null>((t, d) => {
    const ts = d.live?.ts.getTime() ?? null;
    return ts !== null && (t === null || ts > t) ? ts : t;
  }, null);

  const first = cycles[0];
  return {
    key,
    title,
    meterCount: meters.length,
    liveGridW: sumNullable(meters.map((m) => m.liveGridW)),
    liveSolarW: sumNullable(meters.map((m) => m.liveSolarW)),
    lastReadingAt,
    todayGridKwh: round(meters.reduce((s, m) => s + m.todayGridKwh, 0)),
    todaySolarKwh: round(meters.reduce((s, m) => s + m.todaySolarKwh, 0)),
    todayCost: round(meters.reduce((s, m) => s + m.todayGridKwh * avgRate(m), 0)),
    cycleKwh: round(cycles.reduce((s, c) => s + c.kwh, 0)),
    billSoFar: round(cycles.reduce((s, c) => s + c.bill.total, 0)),
    projectedBill: round(cycles.reduce((s, c) => s + c.projected.total, 0)),
    projectedKwh: round(cycles.reduce((s, c) => s + c.projectedKwh, 0)),
    solarCycleKwh: round(cycles.reduce((s, c) => s + (c.solar?.outputKwh ?? 0), 0)),
    solarSaving: round(cycles.reduce((s, c) => s + (c.solar?.saving ?? 0), 0)),
    hasSolar: devices.some((d) => d.source === "solar"),
    hasCycle: cycles.length > 0,
    cycleProgress:
      sameCycle && first
        ? { day: Math.max(Math.ceil(first.daysElapsed), 1), of: first.daysInCycle, start: first.cycle.start, end: first.cycle.end }
        : null,
    partialFrom: cycles.map((c) => c.partialFrom).filter((p): p is string => !!p).sort().at(-1) ?? null,
    dailyAverage: round(cycles.reduce((s, c) => s + c.kwh / Math.max(c.trackedDays, 1), 0)),
    projectionReliable: cycles.every((c) => c.projectionReliable),
    peakToday: [...power.entries()].reduce<{ w: number; ts: number } | null>(
      (best, [ts, b]) => (b.grid !== null && (!best || b.grid > best.w) ? { w: b.grid, ts } : best),
      null,
    ),
    power: [...power.entries()].sort((a, b) => a[0] - b[0]).map(([ts, b]) => ({ ts, ...b })),
    daily: sumSeries("day", meters.map((m) => m.daily)),
    monthly: sumSeries("month", meters.map((m) => m.monthly)),
    devices,
    prepaidWithoutBalance: meters.filter((m) => m.meter.connectionType === "prepaid" && !m.balance).length,
    balances: meters.flatMap((m) => (m.balance ? [{ meterId: m.meter.id, label: meterLabel(m.meter), balance: m.balance }] : [])),
    costs: {
      fixed: round(meters.reduce((s, m) => s + (m.costs?.fixed ?? 0), 0)),
      total: round(cycles.reduce((s, c) => s + c.bill.total, 0)),
      shares: meters
        .flatMap((m) => (m.costs?.shares ?? []).map((sh) => ({ ...sh, meterLabel: meterLabel(m.meter) })))
        .sort((a, b) => b.tk - a.tk),
    },
    ladders: meters.flatMap((m) =>
      m.cycle && m.tariff
        ? [
            {
              meterId: m.meter.id,
              label: meterLabel(m.meter),
              kwh: m.cycle.kwh,
              projectedKwh: m.cycle.projectedKwh,
              tariff: m.tariff,
              nextStep: m.nextStep,
              lifeline: m.cycle.bill.lifeline,
              cycleEnd: m.cycle.cycle.end,
              daysElapsed: m.cycle.daysElapsed,
              daysInCycle: m.cycle.daysInCycle,
              trackedDays: m.cycle.trackedDays,
            },
          ]
        : [],
    ),
  };
}
