// Reads linked Deye stations: a power snapshot each run, Deye's daily totals every so often,
// and a year of daily history once after a station is linked. Runs in the poller process.
import { eq, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { deyeConfigured, stationDaily, stationLatest, type DeyeAccount } from "@/lib/deye/client";
import { parseDaily, parseLatest, type SolarDay } from "@/lib/deye/decode";
import { addDays } from "@/lib/billing";
import { dhakaDay } from "@/lib/energy";
import { errorMessage } from "@/lib/action-result";

type Station = typeof schema.solarStations.$inferSelect;

const DAILY_EVERY_MS = 15 * 60_000;
const BACKFILL_DAYS = 365;
const CHUNK_DAYS = 30; // Deye rejects history spans of 31 days or more

export type SolarPollSummary = { stations: number; stored: number; notes: string[] };

export async function pollSolar(now = new Date()): Promise<SolarPollSummary> {
  const rows = await db
    .select({ station: schema.solarStations, email: schema.profiles.deyeEmail, passwordHash: schema.profiles.deyePasswordHash })
    .from(schema.solarStations)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.solarStations.profileId))
    .where(eq(schema.solarStations.active, true));
  const summary: SolarPollSummary = { stations: rows.length, stored: 0, notes: [] };
  if (rows.length === 0) return summary;
  if (!deyeConfigured()) {
    summary.notes.push("Deye stations are linked but DEYE_APP_ID / DEYE_APP_SECRET are missing in .env");
    return summary;
  }

  for (const { station, email, passwordHash } of rows) {
    try {
      // Each profile reads its stations with its own Deye login.
      if (!email || !passwordHash) throw new Error("This profile's Deye account is not connected");
      const account: DeyeAccount = { email, passwordHash };
      const snap = parseLatest(await stationLatest(account, station.deyeStationId), now);
      const inserted = await db
        .insert(schema.solarReadings)
        .values({ stationId: station.id, ...snap })
        .onConflictDoNothing()
        .returning({ id: schema.solarReadings.id });
      if (inserted.length) summary.stored++;

      if (!station.backfilledAt) {
        const days = await backfill(account, station, now);
        summary.notes.push(`${station.name}: backfilled ${days} days of history`);
      } else if (!station.dailySyncedAt || now.getTime() - station.dailySyncedAt.getTime() >= DAILY_EVERY_MS) {
        // Yesterday too, so its final total lands after midnight.
        const today = dhakaDay(now);
        await storeDays(station.id, parseDaily(await stationDaily(account, station.deyeStationId, addDays(today, -1), addDays(today, 1))));
        await db.update(schema.solarStations).set({ dailySyncedAt: now }).where(eq(schema.solarStations.id, station.id));
      }

      await db.update(schema.solarStations).set({ lastSeenAt: snap.ts, lastError: null }).where(eq(schema.solarStations.id, station.id));
    } catch (e) {
      const message = errorMessage(e);
      summary.notes.push(`${station.name}: ${message}`);
      await db.update(schema.solarStations).set({ lastError: message }).where(eq(schema.solarStations.id, station.id));
    }
  }
  return summary;
}

/** Daily totals for the last year, oldest first, 30 days per request. Returns the days stored. */
async function backfill(account: DeyeAccount, station: Station, now: Date): Promise<number> {
  const today = dhakaDay(now);
  let stored = 0;
  for (let start = addDays(today, -BACKFILL_DAYS); start <= today; start = addDays(start, CHUNK_DAYS)) {
    const end = [addDays(start, CHUNK_DAYS), addDays(today, 1)].sort()[0];
    const days = parseDaily(await stationDaily(account, station.deyeStationId, start, end)).filter((d) => d.day <= today);
    await storeDays(station.id, days);
    stored += days.filter((d) => d.generationKwh + d.consumptionKwh + d.purchaseKwh > 0).length;
  }
  await db.update(schema.solarStations).set({ backfilledAt: now, dailySyncedAt: now }).where(eq(schema.solarStations.id, station.id));
  return stored;
}

async function storeDays(stationId: string, days: SolarDay[]) {
  if (days.length === 0) return;
  const rows = days.map((d) => ({
    stationId,
    day: d.day,
    generationKwh: d.generationKwh.toFixed(3),
    consumptionKwh: d.consumptionKwh.toFixed(3),
    purchaseKwh: d.purchaseKwh.toFixed(3),
    exportKwh: d.exportKwh.toFixed(3),
    chargeKwh: d.chargeKwh.toFixed(3),
    dischargeKwh: d.dischargeKwh.toFixed(3),
  }));
  await db
    .insert(schema.solarDaily)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.solarDaily.stationId, schema.solarDaily.day],
      set: {
        generationKwh: sql`excluded.generation_kwh`,
        consumptionKwh: sql`excluded.consumption_kwh`,
        purchaseKwh: sql`excluded.purchase_kwh`,
        exportKwh: sql`excluded.export_kwh`,
        chargeKwh: sql`excluded.charge_kwh`,
        dischargeKwh: sql`excluded.discharge_kwh`,
      },
    });
}

/** Deletes solar snapshots older than `days`. Daily totals are kept forever. */
export async function pruneSolarReadings(days: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const deleted = await db
    .delete(schema.solarReadings)
    .where(lt(schema.solarReadings.ts, cutoff))
    .returning({ id: schema.solarReadings.id });
  return deleted.length;
}
