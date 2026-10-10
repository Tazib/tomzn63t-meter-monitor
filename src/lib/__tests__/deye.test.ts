import { describe, expect, it } from "vitest";
import { parseDaily, parseDeyeTime, parseLatest } from "@/lib/deye/decode";

const now = new Date("2026-10-10T06:00:00Z");

describe("parseDeyeTime", () => {
  it("reads epoch seconds, milliseconds and strings", () => {
    expect(parseDeyeTime(1790352000)?.toISOString()).toBe("2026-09-25T16:00:00.000Z");
    expect(parseDeyeTime(1790352000000)?.toISOString()).toBe("2026-09-25T16:00:00.000Z");
    expect(parseDeyeTime("1790352000")?.toISOString()).toBe("2026-09-25T16:00:00.000Z");
  });

  it("returns null for missing or zero", () => {
    expect(parseDeyeTime(null)).toBeNull();
    expect(parseDeyeTime(0)).toBeNull();
    expect(parseDeyeTime("")).toBeNull();
  });
});

describe("parseLatest", () => {
  it("prefers the one-sided grid and battery fields over the signed ones", () => {
    const s = parseLatest(
      {
        generationPower: 3838,
        consumptionPower: 882,
        purchasePower: 0,
        gridPower: 1200,
        wirePower: 1200, // sign differs between firmware: ignored when the one-sided fields exist
        chargePower: 1756,
        dischargePower: null,
        batterySOC: 32,
        lastUpdateTime: 1790352000,
      },
      now,
    );
    expect(s).toMatchObject({ generationW: 3838, consumptionW: 882, gridW: -1200, batteryW: -1756, batterySoc: 32 });
    expect(s.ts.toISOString()).toBe("2026-09-25T16:00:00.000Z");
  });

  it("buying from the grid is positive", () => {
    expect(parseLatest({ purchasePower: 640, gridPower: 0 }, now).gridW).toBe(640);
  });

  it("falls back to the signed fields and to the poll time", () => {
    const s = parseLatest({ wirePower: 500, batteryPower: -300, generationPower: "0" }, now);
    expect(s).toMatchObject({ gridW: 500, batteryW: -300, generationW: 0, consumptionW: null, batterySoc: null });
    expect(s.ts).toBe(now);
  });
});

describe("parseDaily", () => {
  it("builds the date from year/month/day and keeps totals non-negative", () => {
    const rows = parseDaily([
      {
        year: 2026,
        month: 9,
        day: 3,
        generationValue: 18.4,
        consumptionValue: "21.2",
        purchaseValue: 6.1,
        gridValue: 0.3,
        chargeValue: 5,
        dischargeValue: 4.6,
      },
      { year: 2026, month: 9, day: 4, generationValue: null, purchaseValue: -1 },
      { generationValue: 3 }, // no date: skipped
    ]);
    expect(rows).toEqual([
      { day: "2026-09-03", generationKwh: 18.4, consumptionKwh: 21.2, purchaseKwh: 6.1, exportKwh: 0.3, chargeKwh: 5, dischargeKwh: 4.6 },
      { day: "2026-09-04", generationKwh: 0, consumptionKwh: 0, purchaseKwh: 0, exportKwh: 0, chargeKwh: 0, dischargeKwh: 0 },
    ]);
  });
});
