import { describe, expect, it } from "vitest";
import { dhakaDay, energyDelta } from "@/lib/energy";

const t0 = new Date("2026-10-07T10:00:00Z");
const t1 = new Date("2026-10-07T10:01:00Z");

describe("energyDelta", () => {
  it("starts a baseline on the first reading", () => {
    expect(energyDelta(null, null, 198.15, t1)).toEqual({ kwh: 0, kind: "first" });
  });
  it("counts the increase between readings", () => {
    expect(energyDelta(198.15, t0, 198.2, t1)).toEqual({ kwh: 0.05, kind: "normal" });
  });
  it("treats a drop as a counter reset and counts the new value", () => {
    expect(energyDelta(198.15, t0, 0.03, t1)).toEqual({ kwh: 0.03, kind: "reset" });
  });
  it("ignores jumps a 63 A breaker could not deliver", () => {
    expect(energyDelta(198.15, t0, 260, t1)).toEqual({ kwh: 0, kind: "implausible" });
  });
  it("allows large but plausible catch-up after an outage", () => {
    const hourLater = new Date(t0.getTime() + 3_600_000);
    expect(energyDelta(100, t0, 110, hourLater)).toEqual({ kwh: 10, kind: "normal" });
  });
});

describe("dhakaDay", () => {
  it("rolls over at midnight Dhaka time (UTC+6)", () => {
    expect(dhakaDay(new Date("2026-10-07T17:59:00Z"))).toBe("2026-10-07");
    expect(dhakaDay(new Date("2026-10-07T18:00:00Z"))).toBe("2026-10-08");
  });
});
