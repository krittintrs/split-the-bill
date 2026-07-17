import { describe, expect, it } from "vitest";
import { itemShareSatang, itemTotalSatang } from "./itemShare";

describe("itemTotalSatang", () => {
  it("applies percent then amount discount, independent of tickedBy", () => {
    // 159.00 × 1 − 10% = 143.10
    expect(itemTotalSatang({ unitPriceSatang: 15900, qty: 1, discountPercent: 10 })).toBe(14310);
  });

  it("applies qty before discounts", () => {
    // 59.00 × 2 − 0.01 = 117.99
    expect(itemTotalSatang({ unitPriceSatang: 5900, qty: 2, discountAmountSatang: 1 })).toBe(
      11799,
    );
  });
});

describe("itemShareSatang", () => {
  it("returns null when nobody ticked", () => {
    expect(itemShareSatang({ unitPriceSatang: 10000, qty: 1, tickedBy: [] })).toBeNull();
  });

  it("splits item total after percent discount, rounded up", () => {
    // 159.00 × 1 − 10% = 143.10 → ÷2 = 71.55
    expect(
      itemShareSatang({ unitPriceSatang: 15900, qty: 1, discountPercent: 10, tickedBy: ["a", "b"] }),
    ).toBe(7155);
  });

  it("applies qty and amount discount, ceils the split", () => {
    // 59.00 × 2 − 0.01 = 117.99 → ÷2 = 59.00 round-up (5899.5 → 5900)
    expect(
      itemShareSatang({ unitPriceSatang: 5900, qty: 2, discountAmountSatang: 1, tickedBy: ["a", "b"] }),
    ).toBe(5900);
  });
});
