"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// Validated dataviz pair, stepped per mode: grid = blue, solar = orange (matches --grid / --solar).
const PALETTE = {
  light: { grid: "#2a78d6", solar: "#eb6834", ink: "#1c2430", muted: "#6b7280", rule: "#e8eaee", surface: "#ffffff" },
  dark: { grid: "#3987e5", solar: "#d95926", ink: "#eef1f5", muted: "#9aa3b2", rule: "#2a2f38", surface: "#1d222b" },
};

function usePalette() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the theme is only known on the client
  useEffect(() => setMounted(true), []);
  return PALETTE[mounted && resolvedTheme === "dark" ? "dark" : "light"];
}

function base(c: (typeof PALETTE)["light"], showLegend: boolean): EChartsOption {
  return {
    animationDuration: 700,
    animationEasing: "cubicOut",
    animationDurationUpdate: 500,
    animationEasingUpdate: "cubicOut",
    textStyle: { fontFamily: "var(--font-geist-sans), system-ui, sans-serif", color: c.muted },
    grid: { left: 4, right: 4, top: showLegend ? 40 : 12, bottom: 0, containLabel: true },
    legend: {
      show: showLegend,
      top: 0,
      left: 0,
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 16,
      icon: "circle",
      textStyle: { color: c.muted, fontSize: 12 },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: c.surface,
      borderColor: c.rule,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: c.ink, fontSize: 12 },
      extraCssText: "border-radius:12px;box-shadow:0 12px 32px -12px rgba(0,0,0,.25);",
    },
  };
}

const valueAxis = (c: (typeof PALETTE)["light"], unit: string): EChartsOption["yAxis"] => ({
  type: "value",
  splitNumber: 4,
  axisLabel: { color: c.muted, formatter: `{value} ${unit}`, fontSize: 11 },
  splitLine: { lineStyle: { color: c.rule, type: [3, 4] } },
});

export type EnergyBar = { label: string; grid: number; solar: number };

/** Grid usage and solar output side by side per day or month (kWh). */
export function EnergyBarChart({ points, showSolar, height = 280 }: { points: EnergyBar[]; showSolar: boolean; height?: number }) {
  const c = usePalette();
  const bar = (name: string, color: string, data: number[]) => ({
    name,
    type: "bar" as const,
    data,
    barMaxWidth: 14,
    barGap: "20%",
    itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    emphasis: { focus: "series" as const },
    animationDelay: (i: number) => i * 12,
  });

  const option: EChartsOption = {
    ...base(c, showSolar),
    tooltip: {
      ...(base(c, showSolar).tooltip as object),
      axisPointer: { type: "shadow", shadowStyle: { color: c.rule, opacity: 0.5 } },
      valueFormatter: (v) => `${Number(v).toFixed(2)} kWh`,
    },
    xAxis: {
      type: "category",
      data: points.map((p) => p.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: c.rule } },
      axisLabel: { color: c.muted, hideOverlap: true, fontSize: 11 },
    },
    yAxis: valueAxis(c, "kWh"),
    series: [
      bar("Grid", c.grid, points.map((p) => p.grid)),
      ...(showSolar ? [bar("Solar", c.solar, points.map((p) => p.solar))] : []),
    ],
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}

export type PowerPoint = { ts: number; grid: number | null; solar: number | null };

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });

/** Today's power curve (W) with a soft fill and a crosshair tooltip. */
export function PowerLineChart({
  points,
  showSolar,
  solarLabel = "Solar",
  height = 280,
}: {
  points: PowerPoint[];
  showSolar: boolean;
  solarLabel?: string;
  height?: number;
}) {
  const c = usePalette();
  const line = (name: string, color: string, key: "grid" | "solar") => ({
    name,
    type: "line" as const,
    data: points.map((p) => [p.ts, p[key]]),
    showSymbol: false,
    symbolSize: 8,
    smooth: 0.35,
    connectNulls: false,
    lineStyle: { width: 2, color },
    itemStyle: { color, borderColor: c.surface, borderWidth: 2 },
    areaStyle: {
      color: {
        type: "linear" as const,
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: `${color}38` },
          { offset: 1, color: `${color}00` },
        ],
      },
    },
  });

  const option: EChartsOption = {
    ...base(c, showSolar),
    tooltip: {
      ...(base(c, showSolar).tooltip as object),
      axisPointer: { type: "line", lineStyle: { color: c.muted, type: [3, 3] } },
      valueFormatter: (v) => (v == null ? "—" : Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} kW` : `${v} W`),
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: c.rule } },
      axisTick: { show: false },
      axisLabel: { color: c.muted, formatter: (v: number) => timeFmt.format(v), hideOverlap: true, fontSize: 11 },
      axisPointer: { label: { formatter: (p: { value: unknown }) => timeFmt.format(Number(p.value)) } },
      splitLine: { show: false },
    },
    yAxis: valueAxis(c, "W"),
    series: [line("Grid", c.grid, "grid"), ...(showSolar ? [line(solarLabel, c.solar, "solar")] : [])],
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
