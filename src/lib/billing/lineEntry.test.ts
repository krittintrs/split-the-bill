import { describe, expect, it } from "vitest";
import { totalFromUnitPriceSatang, unitPriceFromTotalSatang } from "./lineEntry";

describe("totalFromUnitPriceSatang", () => {
  it("multiplies out exactly, no rounding", () => {
    // 107.28 × 4 = 429.12 — the Oyster Bay pad kra pao line
    expect(totalFromUnitPriceSatang(10728, 4)).toBe(42912);
  });

  it("handles qty 1", () => {
    expect(totalFromUnitPriceSatang(9000, 1)).toBe(9000);
  });

  it("handles a free item", () => {
    expect(totalFromUnitPriceSatang(0, 3)).toBe(0);
  });

  it("throws on non-integer satang", () => {
    expect(() => totalFromUnitPriceSatang(10.5, 2)).toThrow();
  });

  it("throws on qty below 1", () => {
    expect(() => totalFromUnitPriceSatang(10000, 0)).toThrow();
  });
});

describe("unitPriceFromTotalSatang", () => {
  it("divides a receipt line total that splits evenly", () => {
    // Oyster Bay: pad kra pao ฿429.12 for 4 → ฿107.28 each
    expect(unitPriceFromTotalSatang(42912, 4)).toBe(10728);
    // beer ฿180.00 for 2 → ฿90.00 each
    expect(unitPriceFromTotalSatang(18000, 2)).toBe(9000);
  });

  it("rounds up when the total does not divide evenly (ADR-0001)", () => {
    // ฿100.00 ÷ 3 = ฿33.333… → ฿33.34, so the organizer is never short
    expect(unitPriceFromTotalSatang(10000, 3)).toBe(3334);
  });

  it("returns the total unchanged at qty 1", () => {
    expect(unitPriceFromTotalSatang(42912, 1)).toBe(42912);
  });

  it("handles a free item", () => {
    expect(unitPriceFromTotalSatang(0, 5)).toBe(0);
  });

  it("throws on non-integer satang", () => {
    expect(() => unitPriceFromTotalSatang(10000.5, 3)).toThrow();
  });

  it("throws on a negative total", () => {
    expect(() => unitPriceFromTotalSatang(-1, 3)).toThrow();
  });

  it("throws on qty below 1", () => {
    expect(() => unitPriceFromTotalSatang(10000, 0)).toThrow();
  });
});

describe("round-tripping between the two entry directions", () => {
  // The editor keeps both boxes live, so a value can bounce between them
  // repeatedly. Neither direction may accumulate drift.
  const qtys = [1, 2, 3, 4, 5, 7, 12];

  it("unit → total → unit is exactly stable", () => {
    for (const qty of qtys) {
      for (const unit of [0, 1, 9000, 10728, 33333, 429120]) {
        const total = totalFromUnitPriceSatang(unit, qty);
        expect(unitPriceFromTotalSatang(total, qty)).toBe(unit);
      }
    }
  });

  it("total → unit → total settles after one pass", () => {
    for (const qty of qtys) {
      for (const typed of [0, 1, 10000, 42912, 18000, 99999]) {
        const unit = unitPriceFromTotalSatang(typed, qty);
        const settled = totalFromUnitPriceSatang(unit, qty);
        // second pass must not move it again
        expect(unitPriceFromTotalSatang(settled, qty)).toBe(unit);
        expect(totalFromUnitPriceSatang(unitPriceFromTotalSatang(settled, qty), qty)).toBe(settled);
      }
    }
  });

  it("compounds the round-up if a settled total is re-settled at a new qty", () => {
    // Why the editor holds the figure the organizer TYPED rather than re-reading
    // the box: the box shows the settled total, and settling that again at a
    // different qty stacks a second round-up on top of the first.
    const typed = 10000; // receipt line reads ฿100.00
    const unitAtThree = unitPriceFromTotalSatang(typed, 3); // ฿33.34
    const settledAtThree = totalFromUnitPriceSatang(unitAtThree, 3); // ฿100.02

    // Re-settling the settled figure at qty 4 drifts ฿0.04 above the receipt.
    expect(unitPriceFromTotalSatang(settledAtThree, 4)).toBe(2501);
    // Re-settling what was typed lands exactly on it.
    expect(unitPriceFromTotalSatang(typed, 4)).toBe(2500);
    expect(totalFromUnitPriceSatang(2500, 4)).toBe(typed);
  });

  it("never settles below what the user typed", () => {
    // Rounding up is what keeps the organizer whole; assert the direction.
    for (const qty of qtys) {
      for (const typed of [1, 10000, 42912, 99999]) {
        const settled = totalFromUnitPriceSatang(unitPriceFromTotalSatang(typed, qty), qty);
        expect(settled).toBeGreaterThanOrEqual(typed);
        expect(settled - typed).toBeLessThan(qty); // drift is bounded by qty − 1 satang
      }
    }
  });
});
