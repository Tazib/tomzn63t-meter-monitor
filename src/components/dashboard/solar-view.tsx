import { formatDistanceToNowStrict } from "date-fns";
import { BatteryMedium, Home, PlugZap, Sun, TriangleAlert } from "lucide-react";
import type { InverterSplit, SolarView as View } from "@/lib/dashboard-data";
import { kwh, period, tk, watts } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/animated-number";
import { EnergyCharts } from "./energy-charts";
import { Panel } from "./dashboard-view";

/** The Solar tab: what the inverter is doing now and what it saved, from Deye Cloud. */
export function SolarView({ view }: { view: View }) {
  return (
    <div className="grid min-w-0 gap-5">
      <Hero view={view} />
      <StatStrip view={view} />
      {view.cycle && (
        <Panel title="This cycle" note={period(view.cycle.start, view.cycle.end)} i={2}>
          <CycleBreakdown cycle={view.cycle} />
        </Panel>
      )}
      <Panel title="Solar and grid" note="Grid = bought from the grid" i={3}>
        <EnergyCharts power={view.power} daily={view.daily} monthly={view.monthly} hasSolar />
      </Panel>
      <Panel title="Inverters" note="Read from Deye Cloud every 5 minutes" i={4}>
        <StationList stations={view.stations} />
      </Panel>
    </div>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.min(Math.max(part / whole, 0), 1) : null);

/** Share of the inverter's energy that came from solar and battery rather than the grid. */
function selfPowered(split: InverterSplit) {
  return pct(split.ownKwh, split.gridKwh + split.ownKwh);
}

function Hero({ view }: { view: View }) {
  const live = view.live;
  const cycle = view.cycle;
  const share = cycle ? selfPowered(cycle.house) : null;

  return (
    <section
      className="rise grid min-w-0 overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/[0.07] md:grid-cols-2"
      style={{ "--i": 0 } as React.CSSProperties}
    >
      <div className="grid min-w-0 content-between gap-6 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Solar now</h2>
          {live ? (
            <span className="flex items-center gap-2 text-xs font-medium text-solar">
              <span className="live-dot" />
              Live
              <span className="font-normal text-muted-foreground">· {formatDistanceToNowStrict(live.ts, { addSuffix: true })}</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No live data</span>
          )}
        </div>
        <div>
          {live?.generationW == null ? (
            <div className="text-[3.25rem] leading-none font-semibold tracking-[-0.04em] text-muted-foreground/50 sm:text-[4rem]">—</div>
          ) : (
            <AnimatedNumber
              value={live.generationW}
              format="power"
              className="block text-[3.25rem] leading-none font-semibold tracking-[-0.04em] sm:text-[4rem]"
              unitClassName="ml-1.5 text-[0.4em] font-medium tracking-normal text-muted-foreground"
            />
          )}
          <p className="mt-2 text-sm text-muted-foreground">{live ? "From the panels" : "Waiting for the inverter to report to Deye Cloud"}</p>
        </div>
        {live && (
          <ul className="grid gap-2 border-t border-border pt-4 text-sm">
            <Flow icon={Home} label="Home using" value={live.consumptionW === null ? "—" : watts(live.consumptionW)} />
            <Flow
              icon={PlugZap}
              label="Grid"
              value={
                live.gridW === null
                  ? "—"
                  : Math.abs(live.gridW) < 10
                    ? "Not used"
                    : live.gridW > 0
                      ? `Buying ${watts(live.gridW)}`
                      : `Sending ${watts(-live.gridW)}`
              }
            />
            {live.batterySoc !== null && (
              <Flow
                icon={BatteryMedium}
                label="Battery"
                value={
                  `${Math.round(live.batterySoc)}%` +
                  (live.batteryW === null || Math.abs(live.batteryW) < 10
                    ? ""
                    : live.batteryW > 0
                      ? ` · giving ${watts(live.batteryW)}`
                      : ` · charging ${watts(-live.batteryW)}`)
                }
              />
            )}
          </ul>
        )}
      </div>

      <div className="grid min-w-0 content-between gap-6 border-t border-border p-6 sm:p-8 md:border-t-0 md:border-l">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Saved this cycle</h2>
          {cycle && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Day {Math.max(Math.ceil(cycle.daysElapsed), 1)} of {cycle.daysInCycle}
            </span>
          )}
        </div>
        <div>
          {cycle ? (
            <AnimatedNumber
              value={cycle.saving}
              format="tk0"
              className="block text-[3.25rem] leading-none font-semibold tracking-[-0.04em] text-solar sm:text-[4rem]"
            />
          ) : (
            <div className="text-[3.25rem] leading-none font-semibold tracking-[-0.04em] text-muted-foreground/50 sm:text-[4rem]">—</div>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            {cycle
              ? `Bill ${tk(cycle.billWithSolar)} so far, instead of ${tk(cycle.billWithoutSolar)} without solar`
              : "Add tariff rates to the meter to see savings"}
          </p>
        </div>
        {share !== null && (
          <div className="grid gap-2">
            <div className="flex h-1.5 gap-[3px] overflow-hidden rounded-full">
              <div className="fill-bar rounded-full bg-solar" style={{ flexGrow: share, flexBasis: 0 }} />
              <div className="fill-bar rounded-full bg-grid" style={{ flexGrow: 1 - share, flexBasis: 0 }} />
            </div>
            <p className="text-xs text-muted-foreground">
              Whole house this cycle: {Math.round(share * 100)}% from solar{view.hasBattery ? " & battery" : ""} (
              {kwh(Math.round(cycle!.house.ownKwh))}), {Math.round((1 - share) * 100)}% from the grid ({kwh(Math.round(cycle!.house.gridKwh))}, all
              meters)
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Flow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </li>
  );
}

function StatStrip({ view }: { view: View }) {
  const t = view.today;
  const share = selfPowered(t.split);
  const cells = [
    { label: "Solar today", value: t.generation, solar: true, hint: t.export > 0 ? `${kwh(t.export)} sent to grid` : undefined },
    { label: "Used from solar & battery", value: t.split.ownKwh, hint: "Today, through the inverter" },
    { label: "Inverter took from grid", value: t.split.gridKwh, hint: "Today" },
  ];

  return (
    <section
      className="rise grid grid-cols-2 overflow-hidden rounded-3xl bg-card ring-1 ring-foreground/[0.07] lg:grid-cols-4"
      style={{ "--i": 1 } as React.CSSProperties}
    >
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={cn("grid gap-1.5 p-5 sm:p-6", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border lg:border-t-0", i === 2 && "lg:border-l")}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {c.solar && <Sun className="size-3.5 text-solar" aria-hidden />}
            {c.label}
          </div>
          <AnimatedNumber value={c.value} format="kwh" className="text-2xl font-semibold tracking-[-0.025em]" />
          {c.hint && <div className="text-xs text-muted-foreground">{c.hint}</div>}
        </div>
      ))}
      <div className="grid gap-1.5 border-t border-l border-border p-5 sm:p-6 lg:border-t-0">
        <div className="text-xs font-medium text-muted-foreground">Self-powered today</div>
        <div className="text-2xl font-semibold tracking-[-0.025em] tabular-nums">{share === null ? "—" : `${Math.round(share * 100)}%`}</div>
        <div className="text-xs text-muted-foreground">Inverter energy from solar and battery</div>
      </div>
    </section>
  );
}

function CycleBreakdown({ cycle }: { cycle: NonNullable<View["cycle"]> }) {
  const rows = [
    { label: "Solar produced", value: cycle.generation, color: "bg-solar/60" },
    { label: "Used from solar and battery", value: cycle.split.ownKwh, color: "bg-solar" },
    { label: "Inverter took from grid", value: cycle.split.gridKwh, color: "bg-grid" },
    ...(cycle.export > 0 ? [{ label: "Sent to grid", value: cycle.export, color: "bg-foreground/25" }] : []),
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="grid gap-5">
      <ul className="grid min-w-0 gap-4">
        {rows.map((r) => (
          <li key={r.label} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="font-semibold tabular-nums">{kwh(Math.round(r.value * 10) / 10)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden>
              <div className={cn("fill-bar h-full rounded-full", r.color)} style={{ transform: `scaleX(${r.value / max})` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Saving = the bill if everything the home used through the inverter had come from the grid, minus the real bill. Priced on the
        meter&apos;s own slabs, so it counts the higher steps solar keeps you out of.
        {cycle.export > 0 && " Power sent to the grid is not credited (no net metering)."}
      </p>
    </div>
  );
}

function StationList({ stations }: { stations: View["stations"] }) {
  return (
    <ul className="-mx-2 grid min-w-0">
      {stations.map((s) => (
        <li key={s.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3">
          <span className={cn("size-2 rounded-full", s.lastError ? "bg-destructive" : s.active ? "bg-solar" : "bg-foreground/25")} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{s.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              Valued on {s.meterLabel}
              {!s.active && " · Paused"}
              {s.lastSeenAt && ` · last report ${formatDistanceToNowStrict(s.lastSeenAt, { addSuffix: true })}`}
            </div>
            {s.lastError && (
              <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                {s.lastError}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
