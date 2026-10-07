import "server-only";
import { and, between, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { addDays, nextPriceStep } from "@/lib/billing";
import { currentCycleBill, tariffFor, type Projection } from "@/lib/billing-data";
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
  nextStep: ReturnType<typeof nextPriceStep>;
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

      return {
        meter,
        devices: withLive,
        liveGridW: livePower(isGrid),
        liveSolarW: livePower(isSolar),
        todayGridKwh: round(withLive.filter((d) => isGrid.has(d.id)).reduce((s, d) => s + d.todayKwh, 0)),
        todaySolarKwh: round(withLive.filter((d) => isSolar.has(d.id)).reduce((s, d) => s + d.todayKwh, 0)),
        cycle,
        nextStep: cycle && t ? nextPriceStep(cycle.kwh, t.tariff) : null,
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
