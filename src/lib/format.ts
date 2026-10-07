const tkFormat = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kwhFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** ৳1,23,456.78 (Bangladeshi digit grouping). */
export function tk(n: number) {
  return `${n < 0 ? "−" : ""}৳${tkFormat.format(Math.abs(n))}`;
}

export function kwh(n: number) {
  return `${kwhFormat.format(n)} kWh`;
}

export function watts(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} kW` : `${Math.round(n)} W`;
}

/** "1 Oct – 31 Oct 2026" from YYYY-MM-DD strings. */
export function period(start: string, end: string) {
  const f = (d: string, year: boolean) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(year && { year: "numeric" }),
      timeZone: "UTC",
    });
  return `${f(start, false)} – ${f(end, true)}`;
}

export function slabRange(fromKwh: number, toKwh: number | null) {
  return toKwh === null ? `${fromKwh}+ kWh` : `${fromKwh}–${toKwh} kWh`;
}
