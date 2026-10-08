import { describe, expect, it } from "vitest";
import { decodePhaseA, hasEnergyCounter, parseStatus } from "@/lib/tuya/decode";

describe("decodePhaseA", () => {
  it("decodes voltage, current and power from the 8-byte raw value", () => {
    // 08 B5 | 00 1C 20 | 00 06 3D → 222.9 V, 7.2 A, 1597 W (real 63T reading)
    expect(decodePhaseA("CLUAHCAABj0=")).toEqual({ voltageV: 222.9, currentA: 7.2, powerW: 1597 });
  });
  it("rejects short payloads", () => {
    expect(decodePhaseA("CLU=")).toBeNull();
  });
});

describe("parseStatus", () => {
  const status = [
    { code: "forward_energy_total", value: 19951 },
    { code: "phase_a", value: "CLUAHCAABj0=" },
    { code: "leakage_current", value: 205 },
    { code: "supply_frequency", value: 499 },
    { code: "online_state", value: "online" },
  ];

  it("scales the energy counter and frequency", () => {
    const m = parseStatus(status);
    expect(m.energyKwh).toBe(199.51);
    expect(m.frequencyHz).toBe(49.9);
    expect(m.leakageMa).toBe(205);
    expect(m.powerW).toBe(1597);
    expect(m.online).toBe(true);
  });

  it("leaves missing data points as null and reads offline state", () => {
    const m = parseStatus([{ code: "online_state", value: "offline" }]);
    expect(m.energyKwh).toBeNull();
    expect(m.powerFactor).toBeNull();
    expect(m.tempC).toBeNull();
    expect(m.online).toBe(false);
  });

  it("knows which devices can be billed", () => {
    expect(hasEnergyCounter(status)).toBe(true);
    expect(hasEnergyCounter([{ code: "switch_1", value: true }])).toBe(false);
  });
});
