import { describe, expect, it } from "vitest";
import { computeBill } from "./compute";
import type { BillInput } from "./types";

const base: BillInput = {
  items: [],
  peerIds: ["a", "b"],
  serviceChargePct: 0,
  vatPct: 0,
};

const item = (over: Partial<BillInput["items"][number]> = {}) => ({
  id: "i1",
  unitPriceSatang: 10000,
  qty: 1,
  tickedBy: ["a"],
  ...over,
});

describe("computeBill validation (malformed input throws)", () => {
  it("rejects non-integer satang price", () => {
    expect(() => computeBill({ ...base, items: [item({ unitPriceSatang: 100.5 })] })).toThrow(
      "non-negative integer satang",
    );
  });
  it("rejects negative price", () => {
    expect(() => computeBill({ ...base, items: [item({ unitPriceSatang: -1 })] })).toThrow(
      "non-negative integer satang",
    );
  });
  it("rejects qty below 1 and non-integer qty", () => {
    expect(() => computeBill({ ...base, items: [item({ qty: 0 })] })).toThrow("positive integer");
    expect(() => computeBill({ ...base, items: [item({ qty: 1.5 })] })).toThrow("positive integer");
  });
  it("rejects percent outside integer 0-100", () => {
    expect(() => computeBill({ ...base, items: [item({ discountPct: 150 })] })).toThrow("0-100");
    expect(() => computeBill({ ...base, items: [item({ discountPct: 7.5 })] })).toThrow("0-100");
    expect(() => computeBill({ ...base, vatPct: -7 })).toThrow("0-100");
    expect(() => computeBill({ ...base, serviceChargePct: 101 })).toThrow("0-100");
    expect(() => computeBill({ ...base, billDiscount: { pct: 200 } })).toThrow("0-100");
  });
  it("rejects ticks by unknown peer", () => {
    expect(() => computeBill({ ...base, items: [item({ tickedBy: ["ghost"] })] })).toThrow(
      "unknown peer",
    );
  });
  it("rejects duplicate ticks by the same peer", () => {
    expect(() => computeBill({ ...base, items: [item({ tickedBy: ["a", "a"] })] })).toThrow(
      "ticked twice",
    );
  });
  it("rejects duplicate item ids", () => {
    expect(() => computeBill({ ...base, items: [item(), item()] })).toThrow("duplicate item id");
  });
  it("rejects duplicate peer ids", () => {
    expect(() => computeBill({ ...base, peerIds: ["a", "a"] })).toThrow("duplicate peerIds");
  });
});

describe("computeBill graceful incomplete states", () => {
  it("computes an empty bill as all zeros", () => {
    expect(computeBill(base)).toEqual({
      peerTotals: { a: 0, b: 0 },
      checksumSatang: 0,
      receiptTotalSatang: 0,
      surplusSatang: 0,
      itemSplits: {},
      untickedItemIds: [],
    });
  });
});

describe("even split (no discounts, no charges)", () => {
  it("splits a line evenly among tickers", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 30000, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 10000, b: 10000, c: 10000 });
    expect(r.checksumSatang).toBe(30000);
    expect(r.receiptTotalSatang).toBe(30000);
    expect(r.surplusSatang).toBe(0);
    expect(r.itemSplits).toEqual({ i1: { a: 10000, b: 10000, c: 10000 } });
  });

  it("rounds each peer UP: 2500 ÷ 3 → 834 each, surplus kept by organizer", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 834, b: 834, c: 834 });
    expect(r.checksumSatang).toBe(2502);
    expect(r.receiptTotalSatang).toBe(2500);
    expect(r.surplusSatang).toBe(2);
  });

  it("multiplies qty into the line total before splitting", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 5000, qty: 3, tickedBy: ["a", "b"] }],
      peerIds: ["a", "b"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 7500, b: 7500 });
  });

  it("flags unticked items: ฿0 contribution, negative surplus signals shortfall", () => {
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["a"] },
        { id: "i2", unitPriceSatang: 5000, qty: 1, tickedBy: [] },
      ],
      peerIds: ["a", "b"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 10000, b: 0 });
    expect(r.checksumSatang).toBe(10000);
    expect(r.receiptTotalSatang).toBe(15000); // paper receipt still includes i2
    expect(r.surplusSatang).toBe(-5000);
    expect(r.untickedItemIds).toEqual(["i2"]);
    expect(r.itemSplits).toEqual({ i1: { a: 10000 }, i2: {} });
  });
});

describe("item discounts (ADR-0003: % first, then amount)", () => {
  const bill = (items: BillInput["items"]): BillInput => ({
    items,
    peerIds: ["a"],
    serviceChargePct: 0,
    vatPct: 0,
  });

  it("applies percentage discount", () => {
    // 159 baht − 10% = 143.10 (Katsu row 1)
    const r = computeBill(bill([{ id: "i1", unitPriceSatang: 15900, qty: 1, discountPct: 10, tickedBy: ["a"] }]));
    expect(r.peerTotals.a).toBe(14310);
  });

  it("applies % before amount", () => {
    // 200.00 − 10% = 180.00, then − 5.00 = 175.00
    const r = computeBill(
      bill([{ id: "i1", unitPriceSatang: 20000, qty: 1, discountPct: 10, discountAmountSatang: 500, tickedBy: ["a"] }]),
    );
    expect(r.peerTotals.a).toBe(17500);
  });

  it("clamps over-discount to ฿0 instead of throwing (mid-editing state)", () => {
    const r = computeBill(
      bill([{ id: "i1", unitPriceSatang: 10000, qty: 1, discountAmountSatang: 15000, tickedBy: ["a"] }]),
    );
    expect(r.peerTotals.a).toBe(0);
    expect(r.receiptTotalSatang).toBe(0);
  });

  it("carries fractional satang exactly until the final round-up", () => {
    // 100.01 − 3% = 97.0097 baht = 9700.97 satang → ceil 9701
    const r = computeBill(bill([{ id: "i1", unitPriceSatang: 10001, qty: 1, discountPct: 3, tickedBy: ["a"] }]));
    expect(r.peerTotals.a).toBe(9701);
  });
});
