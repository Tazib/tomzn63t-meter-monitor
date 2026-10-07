"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

// Validated reference palette (dataviz skill): slot 1 blue = grid, slot 2 orange = solar.
const COLORS = { grid: "#2a78d6", solar: "#eb6834" };
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#8a8984", grid: "#e7e6e2" };

const base: EChartsOption = {
  textStyle: { fontFamily: "var(--font-geist-sans), system-ui, sans-serif", color: INK.secondary },
  grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
  legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, icon: "roundRect", textStyle: { color: INK.secondary } },
  tooltip: {
    trigger: "axis",
    backgroundColor: "#ffffff",
    borderColor: INK.grid,
    textStyle: { color: INK.primary, fontSize: 12 },
  },
};

const valueAxis = (unit: string): EChartsOption["yAxis"] => ({
  type: "value",
  axisLabel: { color: INK.muted, formatter: `{value} ${unit}` },
  splitLine: { lineStyle: { color: INK.grid } },
});

const categoryAxis = (data: string[]): EChartsOption["xAxis"] => ({
  type: "category",
  data,
  axisTick: { show: false },
  axisLine: { lineStyle: { color: INK.grid } },
  axisLabel: { color: INK.muted, hideOverlap: true },
});

export type EnergyBar = { label: string; grid: number; solar: number };

/** Grid usage and solar output side by side per day or month (kWh). */
export function EnergyBarChart({ points, showSolar, height = 260 }: { points: EnergyBar[]; showSolar: boolean; height?: number }) {
  const bar = (name: string, color: string, data: number[]) => ({
    name,
    type: "bar" as const,
    data,
    barMaxWidth: 18,
    barGap: "10%",
    itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    emphasis: { focus: "series" as const },
  });

  const option: EChartsOption = {
    ...base,
    legend: { ...base.legend, show: showSolar },
    grid: { ...base.grid, top: showSolar ? 36 : 12 },
    tooltip: {
      ...base.tooltip,
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,0,0,0.04)" } },
      valueFormatter: (v) => `${Number(v).toFixed(2)} kWh`,
    },
    xAxis: categoryAxis(points.map((p) => p.label)),
    yAxis: valueAxis("kWh"),
    series: [
      bar("Grid", COLORS.grid, points.map((p) => p.grid)),
      ...(showSolar ? [bar("Solar", COLORS.solar, points.map((p) => p.solar))] : []),
    ],
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}

export type PowerPoint = { ts: number; grid: number | null; solar: number | null };

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dhaka" });

/** Today's power curve (W), crosshair tooltip. */
export function PowerLineChart({ points, showSolar, height = 240 }: { points: PowerPoint[]; showSolar: boolean; height?: number }) {
  const line = (name: string, color: string, key: "grid" | "solar") => ({
    name,
    type: "line" as const,
    data: points.map((p) => [p.ts, p[key]]),
    showSymbol: false,
    symbolSize: 8,
    connectNulls: false,
    lineStyle: { width: 2, color },
    itemStyle: { color },
  });

  const option: EChartsOption = {
    ...base,
    legend: { ...base.legend, show: showSolar },
    grid: { ...base.grid, top: showSolar ? 36 : 12 },
    tooltip: {
      ...base.tooltip,
      axisPointer: { type: "line", lineStyle: { color: INK.muted } },
      valueFormatter: (v) => (v == null ? "—" : Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(2)} kW` : `${v} W`),
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: INK.grid } },
      axisLabel: { color: INK.muted, formatter: (v: number) => timeFmt.format(v), hideOverlap: true },
      axisPointer: { label: { formatter: (p: { value: unknown }) => timeFmt.format(Number(p.value)) } },
      splitLine: { show: false },
    },
    yAxis: valueAxis("W"),
    series: [line("Grid", COLORS.grid, "grid"), ...(showSolar ? [line("Solar", COLORS.solar, "solar")] : [])],
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
