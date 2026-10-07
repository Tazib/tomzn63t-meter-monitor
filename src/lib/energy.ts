// Energy counter maths shared by the poller and billing. Pure functions.
import { formatInTimeZone } from "date-fns-tz";

export const TIMEZONE = "Asia/Dhaka";

// A 63 A breaker at 250 V tops out near 16 kW; anything above this is a glitch, not usage.
const MAX_PLAUSIBLE_KW = 20;

/** Calendar day (YYYY-MM-DD) in Asia/Dhaka. */
export function dhakaDay(ts: Date) {
  return formatInTimeZone(ts, TIMEZONE, "yyyy-MM-dd");
}

export type DeltaResult = {
  /** kWh to add to usage; 0 when nothing should be counted. */
  kwh: number;
  /** What happened, for logging. */
  kind: "first" | "normal" | "reset" | "implausible";
};

/**
 * kWh used between two readings of forward_energy_total.
 *
 * - No previous value: start a baseline, count nothing.
 * - Counter dropped: the device was reset, so the new value is the energy since the reset.
 * - A jump larger than the breaker could physically deliver in the elapsed time is ignored
 *   (the new value just becomes the baseline) so one bad reading can't inflate a bill.
 */
export function energyDelta(prevKwh: number | null, prevAt: Date | null, currKwh: number, now: Date): DeltaResult {
  if (prevKwh === null) return { kwh: 0, kind: "first" };

  const kind = currKwh >= prevKwh ? "normal" : "reset";
  const kwh = kind === "normal" ? currKwh - prevKwh : currKwh;

  // Allow at least 5 minutes of headroom so short gaps never reject real usage.
  const hours = Math.max((now.getTime() - (prevAt ?? now).getTime()) / 3_600_000, 5 / 60);
  if (kwh > hours * MAX_PLAUSIBLE_KW) return { kwh: 0, kind: "implausible" };

  return { kwh: round3(kwh), kind };
}

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
