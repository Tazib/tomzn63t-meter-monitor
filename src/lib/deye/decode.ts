// Turns Deye station payloads into plain numbers. Pure functions.

export type SolarSnapshot = {
  /** When Deye last heard from the inverter (falls back to the poll time). */
  ts: Date;
  /** Solar panels, W. */
  generationW: number | null;
  /** Loads the inverter feeds, W. */
  consumptionW: number | null;
  /** Grid, W: positive = buying, negative = selling. */
  gridW: number | null;
  /** Battery, W: positive = discharging, negative = charging. */
  batteryW: number | null;
  batterySoc: number | null;
};

export type SolarDay = {
  day: string;
  generationKwh: number;
  consumptionKwh: number;
  /** Bought from the grid. */
  purchaseKwh: number;
  /** Fed into the grid. */
  exportKwh: number;
  chargeKwh: number;
  dischargeKwh: number;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Deye timestamps are epoch seconds, sometimes milliseconds, sometimes strings. */
export function parseDeyeTime(v: unknown): Date | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return new Date(n > 1e12 ? n : n * 1000);
}

/**
 * The signed flow, preferring the two one-sided fields when Deye sends them (they are always
 * non-negative) over the signed one, whose sign convention differs between firmware.
 */
function signed(positive: unknown, negative: unknown, fallback: unknown): number | null {
  const p = num(positive);
  const n = num(negative);
  if (p !== null || n !== null) return Math.abs(p ?? 0) - Math.abs(n ?? 0);
  return num(fallback);
}

export function parseLatest(raw: Record<string, unknown>, now: Date): SolarSnapshot {
  return {
    ts: parseDeyeTime(raw.lastUpdateTime) ?? now,
    generationW: num(raw.generationPower),
    consumptionW: num(raw.consumptionPower),
    gridW: signed(raw.purchasePower, raw.gridPower, raw.wirePower),
    batteryW: signed(raw.dischargePower, raw.chargePower, raw.batteryPower),
    batterySoc: num(raw.batterySOC),
  };
}

const kwh = (v: unknown) => Math.max(num(v) ?? 0, 0);

/** Daily rows from /station/history (granularity 2); rows without a date are skipped. */
export function parseDaily(items: Record<string, unknown>[]): SolarDay[] {
  const out: SolarDay[] = [];
  for (const it of items) {
    const y = num(it.year);
    const m = num(it.month);
    const d = num(it.day);
    if (!y || !m || !d) continue;
    out.push({
      day: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      generationKwh: kwh(it.generationValue),
      consumptionKwh: kwh(it.consumptionValue),
      purchaseKwh: kwh(it.purchaseValue),
      exportKwh: kwh(it.gridValue),
      chargeKwh: kwh(it.chargeValue),
      dischargeKwh: kwh(it.dischargeValue),
    });
  }
  return out;
}

/**
 * What a Deye inverter is supplying from its own sources right now: panels plus battery discharge
 * (battery charging subtracts), never below 0 or above what its loads use. Grid power isn't in it.
 */
export function inverterOwnSupply(r: { generationW: number | null; batteryW: number | null; consumptionW: number | null }) {
  if (r.generationW === null && r.batteryW === null) return null;
  const supply = Math.max((r.generationW ?? 0) + (r.batteryW ?? 0), 0);
  return r.consumptionW === null ? supply : Math.min(supply, Math.max(r.consumptionW, 0));
}
