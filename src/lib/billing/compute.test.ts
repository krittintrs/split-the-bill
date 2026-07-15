import { describe, expect, it } from "vitest";
import { computeBill } from "./compute";
import type { BillInput } from "./types";

const base: BillInput = {
  items: [],
  peerIds: ["a", "b"],
  serviceChargePercent: 0,
  vatPercent: 0,
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
    expect(() => computeBill({ ...base, items: [item({ discountPercent: 150 })] })).toThrow("0-100");
    expect(() => computeBill({ ...base, items: [item({ discountPercent: 7.5 })] })).toThrow("0-100");
    expect(() => computeBill({ ...base, vatPercent: -7 })).toThrow("0-100");
    expect(() => computeBill({ ...base, serviceChargePercent: 101 })).toThrow("0-100");
    expect(() => computeBill({ ...base, billDiscount: { percent: 200 } })).toThrow("0-100");
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
      serviceChargePercent: 0,
      vatPercent: 0,
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
      serviceChargePercent: 0,
      vatPercent: 0,
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
      serviceChargePercent: 0,
      vatPercent: 0,
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
      serviceChargePercent: 0,
      vatPercent: 0,
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
    serviceChargePercent: 0,
    vatPercent: 0,
  });

  it("applies percentage discount", () => {
    // 159 baht − 10% = 143.10 (Katsu row 1)
    const r = computeBill(bill([{ id: "i1", unitPriceSatang: 15900, qty: 1, discountPercent: 10, tickedBy: ["a"] }]));
    expect(r.peerTotals.a).toBe(14310);
  });

  it("applies % before amount", () => {
    // 200.00 − 10% = 180.00, then − 5.00 = 175.00
    const r = computeBill(
      bill([{ id: "i1", unitPriceSatang: 20000, qty: 1, discountPercent: 10, discountAmountSatang: 500, tickedBy: ["a"] }]),
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
    const r = computeBill(bill([{ id: "i1", unitPriceSatang: 10001, qty: 1, discountPercent: 3, tickedBy: ["a"] }]));
    expect(r.peerTotals.a).toBe(9701);
  });
});

describe("bill discount allocated proportionally (ADR-0003)", () => {
  const twoItems = (billDiscount: BillInput["billDiscount"]): BillInput => ({
    items: [
      { id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["x"] },
      { id: "i2", unitPriceSatang: 20000, qty: 1, tickedBy: ["y"] },
    ],
    peerIds: ["x", "y"],
    billDiscount,
    serviceChargePercent: 0,
    vatPercent: 0,
  });

  it("allocates an amount discount proportionally", () => {
    // 30.00 off 300.00 → ratio 0.9 → 90.00 / 180.00
    const r = computeBill(twoItems({ amountSatang: 3000 }));
    expect(r.peerTotals).toEqual({ x: 9000, y: 18000 });
    expect(r.receiptTotalSatang).toBe(27000);
  });

  it("allocates a percentage discount proportionally", () => {
    const r = computeBill(twoItems({ percent: 10 }));
    expect(r.peerTotals).toEqual({ x: 9000, y: 18000 });
  });

  it("applies % before amount at bill level too", () => {
    // 300.00 − 10% = 270.00, then − 3.00 = 267.00 → ratio 0.89
    const r = computeBill(twoItems({ percent: 10, amountSatang: 300 }));
    expect(r.peerTotals).toEqual({ x: 8900, y: 17800 });
    expect(r.receiptTotalSatang).toBe(26700);
  });

  it("rounds each allocated share up, surplus goes to organizer", () => {
    // items 10.00 + 20.00, discount 10.00 → ratio 2/3 → 6.6667/13.3334 → 667 + 1334
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 1000, qty: 1, tickedBy: ["x"] },
        { id: "i2", unitPriceSatang: 2000, qty: 1, tickedBy: ["y"] },
      ],
      peerIds: ["x", "y"],
      billDiscount: { amountSatang: 1000 },
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.peerTotals).toEqual({ x: 667, y: 1334 });
    expect(r.checksumSatang).toBe(2001);
    expect(r.receiptTotalSatang).toBe(2000);
    expect(r.surplusSatang).toBe(1);
  });

  it("clamps bill over-discount to ฿0 (mid-editing state)", () => {
    const r = computeBill(twoItems({ amountSatang: 99999 }));
    expect(r.peerTotals).toEqual({ x: 0, y: 0 });
    expect(r.receiptTotalSatang).toBe(0);
  });
});

describe("service charge then VAT, compounded (ADR-0003)", () => {
  const single = (serviceChargePercent: number, vatPercent: number, unitPriceSatang = 10000): BillInput => ({
    items: [{ id: "i1", unitPriceSatang, qty: 1, tickedBy: ["a"] }],
    peerIds: ["a"],
    serviceChargePercent,
    vatPercent,
  });

  it("SC only: 10%", () => {
    expect(computeBill(single(10, 0)).peerTotals.a).toBe(11000);
  });

  it("VAT only: 7%", () => {
    expect(computeBill(single(0, 7)).peerTotals.a).toBe(10700);
  });

  it("5% SC + 7% VAT compound: ×1.05 then ×1.07", () => {
    expect(computeBill(single(5, 7)).peerTotals.a).toBe(11235);
  });

  it("10% SC + 7% VAT compound", () => {
    expect(computeBill(single(10, 7)).peerTotals.a).toBe(11770);
  });

  it("rounds up after compounding: 99.99 × 1.05 × 1.07 = 112.338765 → 112.34", () => {
    expect(computeBill(single(5, 7, 9999)).peerTotals.a).toBe(11234);
  });

  it("compounds after even split: 2500 ÷ 3 × 1.10 × 1.07 → 981 each", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 10,
      vatPercent: 7,
    });
    expect(r.peerTotals).toEqual({ a: 981, b: 981, c: 981 });
    expect(r.checksumSatang).toBe(2943);
    expect(r.receiptTotalSatang).toBe(2943); // 2942.5 → ceil
    expect(r.surplusSatang).toBe(0);
  });
});

describe("canonical Katsu fixture (split-the-bill-example.csv)", () => {
  const katsu: BillInput = {
    items: [
      { id: "katsu", unitPriceSatang: 15900, qty: 1, discountPercent: 10, tickedBy: ["D"] },
      { id: "cheesy-don", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["A"] },
      { id: "chicken-don", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: ["B"] },
      { id: "add-on-59", unitPriceSatang: 5900, qty: 1, discountPercent: 10, tickedBy: ["B"] },
      { id: "add-on-89", unitPriceSatang: 8900, qty: 1, discountPercent: 10, tickedBy: ["E"] },
      { id: "a-la-carte-loin", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: ["E"] },
      { id: "chicken-katsu-set", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["C"] },
    ],
    peerIds: ["A", "B", "C", "D", "E"],
    serviceChargePercent: 0,
    vatPercent: 0,
  };

  it("reproduces every peer total and the checksum from the real sheet", () => {
    const r = computeBill(katsu);
    expect(r.peerTotals).toEqual({ A: 17910, B: 18720, C: 17910, D: 14310, E: 21420 });
    expect(r.checksumSatang).toBe(90270); // ฿902.70
    expect(r.receiptTotalSatang).toBe(90270);
    expect(r.surplusSatang).toBe(0);
    expect(r.untickedItemIds).toEqual([]);
  });
});

describe("full pipeline integration (every stage at once)", () => {
  it("combines qty, item discounts, bill discount, SC and VAT across a shared item", () => {
    // i1: 100.00 × 2 − 10% = 180.00, split A/B → 90.00 each
    // i2: 150.00 − 5.00 = 145.00, B only
    // subtotal 325.00; bill −10% then −2.50 → 290.00 → ratio 58/65
    // × 1.10 × 1.07; A: 9000×58/65×1.177 = 9452.215… → 9453
    //                B: 23500×58/65×1.177 = 24680.784… → 24681
    // receipt: 29000×1.177 = 34133 exact; surplus = 34134 − 34133
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 10000, qty: 2, discountPercent: 10, tickedBy: ["A", "B"] },
        { id: "i2", unitPriceSatang: 15000, qty: 1, discountAmountSatang: 500, tickedBy: ["B"] },
      ],
      peerIds: ["A", "B"],
      billDiscount: { percent: 10, amountSatang: 250 },
      serviceChargePercent: 10,
      vatPercent: 7,
    });
    expect(r.peerTotals).toEqual({ A: 9453, B: 24681 });
    expect(r.checksumSatang).toBe(34134);
    expect(r.receiptTotalSatang).toBe(34133);
    expect(r.surplusSatang).toBe(1);
  });
});
