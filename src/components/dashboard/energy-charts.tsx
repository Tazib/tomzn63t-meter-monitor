"use client";

import { EnergyBarChart, PowerLineChart, type PowerPoint } from "@/components/charts";
import { SegmentedTabs } from "@/components/segmented-tabs";

type Day = { day: string; grid: number; solar: number };
type Month = { month: string; grid: number; solar: number };

const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });

/** One chart area with a range switcher: today's power, last 30 days, last 12 months. */
export function EnergyCharts({
  power,
  daily,
  monthly,
  hasSolar,
  powerSolarLabel,
}: {
  power: PowerPoint[];
  daily: Day[];
  monthly: Month[];
  hasSolar: boolean;
  /** Name of the solar line on today's power chart. */
  powerSolarLabel?: string;
}) {
  return (
    <SegmentedTabs
      label="Chart range"
      size="sm"
      tabs={[
        { key: "today", label: "Today" },
        { key: "30d", label: "30 days" },
        { key: "12m", label: "12 months" },
      ]}
      panels={[
        power.length ? (
          <PowerLineChart key="p" points={power} showSolar={hasSolar} solarLabel={powerSolarLabel} />
        ) : (
          <Empty key="p">No readings yet today. They appear here a minute after the poller runs.</Empty>
        ),
        <EnergyBarChart key="d" points={daily.map((d) => ({ label: dayLabel(d.day), grid: d.grid, solar: d.solar }))} showSolar={hasSolar} />,
        <EnergyBarChart key="m" points={monthly.map((d) => ({ label: monthLabel(d.month), grid: d.grid, solar: d.solar }))} showSolar={hasSolar} />,
      ]}
    />
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-[280px] place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
      <p className="max-w-xs">{children}</p>
    </div>
  );
}
