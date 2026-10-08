"use client";

import { useEffect, useRef, useState } from "react";

export type NumberFormat = "power" | "kwh" | "tk" | "tk0" | "int" | "dec1";

const tkFmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tk0Fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const kwhFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** Splits a value into the number part and its unit so units can be styled smaller. */
export function formatParts(value: number, format: NumberFormat): { prefix?: string; number: string; unit?: string } {
  const sign = value < 0 ? "−" : "";
  const v = Math.abs(value);
  switch (format) {
    case "power":
      return v >= 1000 ? { number: sign + (v / 1000).toFixed(2), unit: "kW" } : { number: sign + Math.round(v), unit: "W" };
    case "kwh":
      return { number: sign + kwhFmt.format(v), unit: "kWh" };
    case "tk":
      return { prefix: sign + "৳", number: tkFmt.format(v) };
    case "tk0":
      return { prefix: sign + "৳", number: tk0Fmt.format(v) };
    case "dec1":
      return { number: sign + v.toFixed(1) };
    default:
      return { number: sign + Math.round(v).toString() };
  }
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * Renders a number that glides to its new value when it changes (e.g. on the minute refresh).
 * First render shows the real value immediately: no count-up on page load.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  unitClassName = "ml-1 text-[0.5em] font-medium text-muted-foreground",
}: {
  value: number;
  format: NumberFormat;
  className?: string;
  unitClassName?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    // Reduced motion: jump straight to the new value on the next frame.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = duration ? Math.min((now - t0) / duration, 1) : 1;
      const v = start + (value - start) * easeOutExpo(t);
      from.current = v;
      setShown(v);
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  const p = formatParts(shown, format);
  return (
    <span className={className}>
      {p.prefix && <span className="mr-0.5 font-medium">{p.prefix}</span>}
      <span className="tabular-nums">{p.number}</span>
      {p.unit && <span className={unitClassName}>{p.unit}</span>}
    </span>
  );
}
