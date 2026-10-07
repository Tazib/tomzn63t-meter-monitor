// Standalone poller: `npm run poller`. Polls every POLL_INTERVAL_SECONDS (default 60),
// aligned to the clock so readings land on whole minutes. Read-only towards Tuya.
import "dotenv/config";
import { pollOnce, pruneReadings } from "../src/lib/poll";
import { finalizeBills } from "../src/lib/billing-data";

const intervalMs = Math.max(Number(process.env.POLL_INTERVAL_SECONDS) || 60, 10) * 1000;
const retentionDays = Number(process.env.READINGS_RETENTION_DAYS) || 180;
const HOUR = 3_600_000;
let stopping = false;
let timer: NodeJS.Timeout | undefined;
let lastHousekeeping = 0;

/** Hourly: store bills for finished cycles and drop old per-minute readings (daily totals are kept). */
async function housekeeping(now: Date) {
  if (now.getTime() - lastHousekeeping < HOUR) return;
  lastHousekeeping = now.getTime();
  try {
    const bills = await finalizeBills(now);
    const pruned = await pruneReadings(retentionDays, now);
    if (bills || pruned) console.log(`  housekeeping: stored ${bills} bills, pruned ${pruned} old readings`);
  } catch (e) {
    console.error("  housekeeping failed:", e instanceof Error ? e.message : e);
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
