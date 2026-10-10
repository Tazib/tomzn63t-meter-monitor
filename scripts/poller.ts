// Standalone poller: `npm run poller`. Polls every POLL_INTERVAL_SECONDS (default 60),
// aligned to the clock so readings land on whole minutes. Read-only towards Tuya.
import "dotenv/config";
import { pollOnce, pruneReadings } from "../src/lib/poll";
import { finalizeBills } from "../src/lib/billing-data";
import { pollSolar, pruneSolarReadings } from "../src/lib/solar-poll";

const intervalMs = Math.max(Number(process.env.POLL_INTERVAL_SECONDS) || 60, 10) * 1000;
const retentionDays = Number(process.env.READINGS_RETENTION_DAYS) || 180;
// Deye loggers upload about every 5 minutes; asking more often only burns API quota.
const solarIntervalMs = Math.max(Number(process.env.DEYE_POLL_SECONDS) || 300, 60) * 1000;
const HOUR = 3_600_000;
let stopping = false;
let timer: NodeJS.Timeout | undefined;
let lastHousekeeping = 0;
let lastSolar = 0;

/** Hourly: store bills for finished cycles and drop old per-minute readings (daily totals are kept). */
async function housekeeping(now: Date) {
  if (now.getTime() - lastHousekeeping < HOUR) return;
  lastHousekeeping = now.getTime();
  try {
    const bills = await finalizeBills(now);
    const pruned = (await pruneReadings(retentionDays, now)) + (await pruneSolarReadings(retentionDays, now));
    if (bills || pruned) console.log(`  housekeeping: stored ${bills} bills, pruned ${pruned} old readings`);
  } catch (e) {
    console.error("  housekeeping failed:", e instanceof Error ? e.message : e);
  }
}

/** Deye inverters, on their own slower cadence. */
async function solar(now: Date) {
  if (now.getTime() - lastSolar < solarIntervalMs - 5_000) return;
  lastSolar = now.getTime();
  try {
    const s = await pollSolar(now);
    if (s.stations) console.log(`  solar: ${s.stations} stations, ${s.stored} new snapshots`);
    for (const note of s.notes) console.log(`  solar: ${note}`);
  } catch (e) {
    console.error("  solar poll failed:", e instanceof Error ? e.message : e);
  }
}

async function tick() {
  const started = new Date();
  try {
    const s = await pollOnce(started);
    const ms = Date.now() - started.getTime();
    console.log(
      `${started.toISOString()} polled ${s.devices} devices: ${s.stored} stored, ${s.offline} offline, ${s.missing} missing (${ms} ms)`,
    );
    for (const note of s.notes) console.log(`  ${note}`);
  } catch (e) {
    console.error(`${started.toISOString()} poll failed:`, e instanceof Error ? e.message : e);
  }
  await solar(started);
  await housekeeping(started);
  schedule();
}

function schedule() {
  if (stopping) return;
  const wait = intervalMs - (Date.now() % intervalMs);
  timer = setTimeout(tick, wait);
}

function stop() {
  stopping = true;
  clearTimeout(timer);
  console.log("Poller stopped");
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log(`Poller started, every ${intervalMs / 1000}s`);
if (process.argv.includes("--once")) {
  stopping = true;
  tick().then(() => process.exit(0));
} else {
  tick();
}
