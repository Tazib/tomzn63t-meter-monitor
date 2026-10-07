// Turns raw 63T data points into numbers. Pure functions, safe to use anywhere.
import type { TuyaStatus } from "./client";

export type PhaseA = { voltageV: number; currentA: number; powerW: number };

export type Measurement = {
  energyKwh: number | null;
  powerW: number | null;
  voltageV: number | null;
  currentA: number | null;
  powerFactor: number | null;
  frequencyHz: number | null;
  leakageMa: number | null;
  tempC: number | null;
  online: boolean;
};

/**
 * phase_a is base64 of 8 big-endian bytes:
 * 0–1 voltage (/10 V), 2–4 current (/1000 A), 5–7 active power (/1000 kW).
 */
export function decodePhaseA(raw: string): PhaseA | null {
  const b = Buffer.from(raw, "base64");
  if (b.length < 8) return null;
  return {
    voltageV: b.readUInt16BE(0) / 10,
    currentA: b.readUIntBE(2, 3) / 1000,
    powerW: b.readUIntBE(5, 3), // kW/1000 = W
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Normalises a device's status list. `energyScale` is the decimal scale of forward_energy_total. */
export function parseStatus(status: TuyaStatus[], energyScale = 2): Measurement {
  const dp = new Map(status.map((s) => [s.code, s.value]));
  const energy = num(dp.get("forward_energy_total"));
  const phase = typeof dp.get("phase_a") === "string" ? decodePhaseA(dp.get("phase_a") as string) : null;
  const pf = num(dp.get("power_factor"));
  const freq = num(dp.get("supply_frequency"));

  return {
    energyKwh: energy === null ? null : energy / 10 ** energyScale,
    powerW: phase?.powerW ?? null,
    voltageV: phase?.voltageV ?? null,
    currentA: phase?.currentA ?? null,
    powerFactor: pf === null ? null : pf / 100,
    frequencyHz: freq === null ? null : freq / 10,
    leakageMa: num(dp.get("leakage_current")),
    tempC: num(dp.get("temp_zone_1")),
    online: dp.get("online_state") !== "offline",
  };
}

/** True when the device reports a cumulative energy counter (i.e. it can be billed). */
export function hasEnergyCounter(status: TuyaStatus[]) {
  return status.some((s) => s.code === "forward_energy_total");
}
