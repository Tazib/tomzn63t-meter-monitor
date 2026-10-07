// Bill maths for Bangladesh slab tariffs. Pure functions, no database access.
//
// Bill = energy charge (telescopic slabs, or lifeline rate for small users)
//      + demand charge × sanctioned kW
//      − rebate % of (energy + demand)
//      + VAT % of (energy + demand − rebate)
//      + meter rent

/** Slab rows offered on the tariff form. */
export const SLAB_ROWS = 8;

export type Slab = { fromKwh: number; toKwh: number | null; rate: number };

export type Tariff = {
  lifelineMaxKwh: number | null;
  lifelineRate: number | null;
  demandChargePerKw: number;
  vatPercent: number;
  slabs: Slab[]; // sorted by fromKwh
};

export type MeterCharges = { sanctionedLoadKw: number; meterRent: number; rebatePercent: number };

export type BillLine = { fromKwh: number; toKwh: number | null; kwh: number; rate: number; amount: number };

export type Bill = {
  kwh: number;
  lifeline: boolean;
  lines: BillLine[];
  energyCharge: number;
  demandCharge: number;
  rebate: number;
  vat: number;
  meterRent: number;
  total: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

export function computeBill(kwhRaw: number, tariff: Tariff, meter: MeterCharges): Bill {
  const kwh = Math.max(0, kwhRaw);
  const lines: BillLine[] = [];
  const lifeline =
    tariff.lifelineMaxKwh !== null && tariff.lifelineRate !== null && kwh <= tariff.lifelineMaxKwh;

  if (lifeline) {
    lines.push({ fromKwh: 0, toKwh: tariff.lifelineMaxKwh, kwh, rate: tariff.lifelineRate!, amount: money(kwh * tariff.lifelineRate!) });
  } else {
    for (const s of tariff.slabs) {
      const upper = s.toKwh ?? Infinity;
      const used = Math.min(kwh, upper) - s.fromKwh;
      if (used <= 0) continue;
      lines.push({ fromKwh: s.fromKwh, toKwh: s.toKwh, kwh: used, rate: s.rate, amount: money(used * s.rate) });
    }
  }

  const energyCharge = money(lines.reduce((t, l) => t + l.amount, 0));
  const demandCharge = money(tariff.demandChargePerKw * meter.sanctionedLoadKw);
  const rebate = money(((energyCharge + demandCharge) * meter.rebatePercent) / 100);
  const vat = money(((energyCharge + demandCharge - rebate) * tariff.vatPercent) / 100);
  const meterRent = money(meter.meterRent);
  const total = money(energyCharge + demandCharge - rebate + vat + meterRent);

  return { kwh, lifeline, lines, energyCharge, demandCharge, rebate, vat, meterRent, total };
}

/** Units left before the per-unit price goes up, and the price after that. Null on the top slab. */
export function nextPriceStep(kwh: number, tariff: Tariff): { unitsLeft: number; nextRate: number; currentRate: number } | null {
  const slabAt = (k: number) => tariff.slabs.find((s) => k >= s.fromKwh && (s.toKwh === null || k < s.toKwh));

  if (tariff.lifelineMaxKwh !== null && tariff.lifelineRate !== null && kwh <= tariff.lifelineMaxKwh) {
    // Crossing the lifeline limit re-prices every unit at the slab rates.
    const first = tariff.slabs[0];
    return first
      ? { unitsLeft: tariff.lifelineMaxKwh - kwh, nextRate: first.rate, currentRate: tariff.lifelineRate }
      : null;
  }

  const current = slabAt(kwh);
  if (!current || current.toKwh === null) return null;
  const next = slabAt(current.toKwh);
  return next ? { unitsLeft: current.toKwh - kwh, nextRate: next.rate, currentRate: current.rate } : null;
}

// ---------------------------------------------------------------- billing cycles

/** Dates are plain YYYY-MM-DD strings (already in Asia/Dhaka). */
function ymd(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.toISOString().slice(0, 10);
}

function parts(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m: m - 1, d };
}

export function addDays(day: string, n: number) {
  const { y, m, d } = parts(day);
  return ymd(y, m, d + n);
}

/** Inclusive number of days from start to end. */
export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

export type Cycle = { start: string; end: string };

/** The billing cycle containing `day`. cycleDay 1 = calendar month. */
export function cycleFor(day: string, cycleDay: number): Cycle {
  const { y, m, d } = parts(day);
  const startMonth = d >= cycleDay ? m : m - 1;
  const start = ymd(y, startMonth, cycleDay);
  const end = ymd(y, startMonth + 1, cycleDay - 1);
  return { start, end };
}

export function previousCycle(cycle: Cycle, cycleDay: number): Cycle {
  return cycleFor(addDays(cycle.start, -1), cycleDay);
}
