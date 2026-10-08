import { TriangleAlert } from "lucide-react";
import type { Ladder } from "@/lib/dashboard-data";
import { kwh, shortDate, tk } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The tariff as a ladder of price steps, filled to this cycle's usage, with the projected
 * end-of-cycle usage shown as a lighter extension. Money in context: every step shows its rate.
 */
export function SlabLadder({ ladder, showLabel }: { ladder: Ladder; showLabel: boolean }) {
  const { tariff, kwh: now, projectedKwh: projected, nextStep } = ladder;
  const finite = tariff.slabs.map((s) => s.toKwh).filter((t): t is number => t !== null);
  const reach = Math.max(now, projected) * 1.08;
  // Show the ladder up to the first boundary past the projection (or a bit past the last one),
  // and never fewer than two steps, so there's always a "next price" in view.
  const domain = Math.max(
    finite.find((b) => b >= reach) ?? Math.max(reach, (finite.at(-1) ?? 100) * 1.2),
    finite[1] ?? finite[0] ?? 100,
  );
  const pct = (v: number) => Math.min(Math.max(v / domain, 0), 1) * 100;

  const segments = tariff.slabs
    .filter((s) => s.fromKwh < domain)
    .map((s) => {
      const to = Math.min(s.toKwh ?? domain, domain);
      const span = to - s.fromKwh;
      return {
        ...s,
        width: span / domain,
        fill: Math.min(Math.max((now - s.fromKwh) / span, 0), 1),
        projected: Math.min(Math.max((projected - s.fromKwh) / span, 0), 1),
        current: !ladder.lifeline && now >= s.fromKwh && (s.toKwh === null || now < s.toKwh),
      };
    });

  const perDay = now / Math.max(ladder.trackedDays, 0.25);
  const daysToStep = nextStep && perDay > 0 ? nextStep.unitsLeft / perDay : null;
  const daysLeft = ladder.daysInCycle - ladder.daysElapsed;
  const stepSoon = daysToStep !== null && daysToStep < daysLeft;
  const lifelineMax = tariff.lifelineMaxKwh;
  const nowLabelRight = pct(now) > 70;
  const projLabelRight = pct(projected) > 70;
  const close = Math.abs(pct(projected) - pct(now)) < 18;

  return (
    <div className="grid gap-5">
      {showLabel && <div className="text-sm font-medium">{ladder.label}</div>}

      <div className="relative pt-12">
        {/* Markers ride full-width layers shifted with translateX, so they glide on refresh. */}
        <Marker pct={pct(projected)} row={close ? 0 : 1} alignRight={projLabelRight} tone="muted">
          ≈ {kwh(roundKwh(projected))} by {shortDate(ladder.cycleEnd)}
        </Marker>
        <Marker pct={pct(now)} row={1} alignRight={nowLabelRight} tone="strong">
          {kwh(roundKwh(now))} now
        </Marker>

        <div className="flex gap-[3px]" role="img" aria-label={`${kwh(now)} used so far, about ${kwh(Math.round(projected))} projected`}>
          {segments.map((s, i) => (
            <div key={s.fromKwh} className="grid min-w-0 gap-2" style={{ flexGrow: s.width, flexBasis: 0 }}>
              <div className="relative h-3 overflow-hidden rounded-full bg-foreground/[0.07]">
                <div
                  className="fill-bar absolute inset-0 bg-grid/25"
                  style={{ transform: `scaleX(${s.projected})`, transitionDelay: `${i * 70}ms` }}
                />
                <div
                  className="fill-bar absolute inset-0 rounded-full bg-grid"
                  style={{ transform: `scaleX(${s.fill})`, transitionDelay: `${i * 70}ms` }}
                />
              </div>
              <div className="grid overflow-hidden text-[0.7rem] leading-tight whitespace-nowrap tabular-nums">
                <span className={cn(s.current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {tk(s.rate).replace(".00", "")}
                </span>
                <span className="text-muted-foreground/75">
                  {s.toKwh === null ? `${s.fromKwh}+` : `${s.fromKwh}–${s.toKwh}`}
                </span>
              </div>
            </div>
          ))}
        </div>

        {lifelineMax !== null && lifelineMax < domain && ladder.lifeline && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0">
            <div className="absolute bottom-9 h-6 border-l border-dashed border-foreground/40" style={{ left: `${pct(lifelineMax)}%` }} />
            <span
              className="absolute -bottom-1 -translate-x-1/2 rounded-full bg-card px-1.5 text-[0.7rem] font-medium whitespace-nowrap text-foreground tabular-nums"
              style={{ left: `${pct(lifelineMax)}%` }}
            >
              Lifeline {tk(tariff.lifelineRate ?? 0).replace(".00", "")} to {lifelineMax}
            </span>
          </div>
        )}
      </div>

      <StepMessage ladder={ladder} stepSoon={stepSoon} daysToStep={daysToStep} />
    </div>
  );
}

/** One decimal for small amounts so early-cycle numbers don't all read "0 kWh". */
function roundKwh(v: number) {
  return v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
}

function Marker({
  pct,
  row,
  alignRight,
  tone,
  children,
}: {
  pct: number;
  row: 0 | 1;
  alignRight: boolean;
  tone: "strong" | "muted";
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className="marker-glide pointer-events-none absolute inset-x-0"
      style={{ top: row === 0 ? 0 : 22, transform: `translateX(${pct}%)` }}
    >
      <div className="relative">
        <span
          className={cn(
            "absolute top-0 text-xs whitespace-nowrap tabular-nums",
            alignRight ? "right-full mr-1.5" : "left-1.5",
            tone === "strong" ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {children}
        </span>
        <span
          className={cn(
            "absolute left-0 w-px",
            tone === "strong" ? "bg-foreground" : "border-l border-dashed border-muted-foreground/70",
          )}
          style={{ top: 2, height: row === 0 ? 46 : 24 }}
        />
      </div>
    </div>
  );
}

function StepMessage({ ladder, stepSoon, daysToStep }: { ladder: Ladder; stepSoon: boolean; daysToStep: number | null }) {
  const { nextStep } = ladder;
  if (!nextStep) {
    return <p className="text-sm text-muted-foreground">Top step: every extra unit this cycle costs {tk(ladder.tariff.slabs.at(-1)?.rate ?? 0)}.</p>;
  }
  const units = kwh(Math.max(Math.round(nextStep.unitsLeft * 10) / 10, 0));
  const text = ladder.lifeline
    ? `${units} left on the lifeline rate of ${tk(nextStep.currentRate)}. Past ${ladder.tariff.lifelineMaxKwh} kWh, every unit this cycle is billed on the steps instead.`
    : `${units} until units cost ${tk(nextStep.nextRate)} instead of ${tk(nextStep.currentRate)}.`;

  if (stepSoon && daysToStep !== null) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-warning-surface px-4 py-3 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          <span className="font-semibold">
            At this pace you cross it in about {Math.max(Math.round(daysToStep), 1)} day{Math.round(daysToStep) === 1 ? "" : "s"}.
          </span>{" "}
          <span className="text-foreground/80">{text}</span>
        </p>
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

