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
      discountSatang: 0,
      subtotalSatang: 0,
      serviceChargeSatang: 0,
      vatSatang: 0,
      peerBreakdowns: {
        a: { discountSatang: 0, subtotalSatang: 0, serviceChargeSatang: 0, vatSatang: 0 },
        b: { discountSatang: 0, subtotalSatang: 0, serviceChargeSatang: 0, vatSatang: 0 },
      },
      itemLeftovers: {},
      billLeftover: undefined,
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

  it("ties per item: 2500 ÷ 3 floors to 833 each, item's own leftover goes to its first ticker", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.peerTotals).toEqual({ a: 834, b: 833, c: 833 });
    expect(r.checksumSatang).toBe(2500);
    expect(r.receiptTotalSatang).toBe(2500);
    expect(r.surplusSatang).toBe(0);
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

  it("bill-tier remainder can be negative: two single-ticker items overshoot, absorber gives one back", () => {
    // i1 (x alone) ceils to 667, i2 (y alone) ceils to 1334 — sum 2001 vs receipt 2000.
    // Bill-tier remainder is −1; default absorber x drops from 667 to 666.
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
    expect(r.peerTotals).toEqual({ x: 666, y: 1334 });
    expect(r.checksumSatang).toBe(2000);
    expect(r.receiptTotalSatang).toBe(2000);
    expect(r.surplusSatang).toBe(0);
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

  it("item-tier ceiling compounds through SC/VAT before the bill-tier remainder lands", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 10,
      vatPercent: 7,
    });
    expect(r.peerTotals).toEqual({ a: 983, b: 980, c: 980 });
    expect(r.checksumSatang).toBe(2943);
    expect(r.receiptTotalSatang).toBe(2943);
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

describe("breakdown fields (subtotal / SC / VAT, bill-level and per-peer)", () => {
  it("bill-level breakdown sums exactly to receiptTotalSatang, no SC/VAT", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 30000, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.subtotalSatang).toBe(30000);
    expect(r.serviceChargeSatang).toBe(0);
    expect(r.vatSatang).toBe(0);
    expect(r.subtotalSatang + r.serviceChargeSatang + r.vatSatang).toBe(r.receiptTotalSatang);
  });

  it("bill-level breakdown with 5% SC + 7% VAT (the #34 example bill)", () => {
    // ค่าข้าว 5555.00 + Soju 510.00 = 6065.00 subtotal
    const r = computeBill({
      items: [
        { id: "katao", unitPriceSatang: 555500, qty: 1, tickedBy: ["a", "b", "c", "d", "e"] },
        { id: "soju", unitPriceSatang: 51000, qty: 1, tickedBy: ["a"] },
      ],
      peerIds: ["a", "b", "c", "d", "e"],
      serviceChargePercent: 5,
      vatPercent: 7,
    });
    expect(r.subtotalSatang).toBe(606500);
    expect(r.serviceChargeSatang).toBe(30325); // 6065.00 × 5% = 303.25
    // vatSatang is the residual line: total − subtotal − SC, so the three always sum exactly
    expect(r.subtotalSatang + r.serviceChargeSatang + r.vatSatang).toBe(r.receiptTotalSatang);
    expect(r.receiptTotalSatang).toBe(681403); // ceil(6065 × 1.05 × 1.07) = 6814.03 (see mockup)
  });

  it("per-peer breakdown sums exactly to that peer's peerTotals entry", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 10,
      vatPercent: 7,
    });
    for (const id of ["a", "b", "c"]) {
      const b = r.peerBreakdowns[id];
      expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
    }
  });

  it("per-peer breakdown reconciles across the full-pipeline integration fixture", () => {
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
    for (const id of ["A", "B"]) {
      const b = r.peerBreakdowns[id];
      expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
    }
    expect(r.peerTotals).toEqual({ A: 9453, B: 24680 }); // was {A: 9453, B: 24681}
  });

  it("discountSatang reconciles against an independently-computed gross, with item AND bill discount", () => {
    // Same fixture as above: i1 has a 10% item discount, i2 a ฿5.00 item discount, plus a
    // 10%+฿2.50 bill discount. Pre-discount (gross) shares: A ticks half of i1 only
    // (20000÷2 = 10000 satang), B ticks the other half of i1 plus all of i2
    // (10000 + 15000 = 25000 satang). Bill gross = 20000 + 15000 = 35000 satang.
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
    const a = r.peerBreakdowns.A;
    const b = r.peerBreakdowns.B;
    // Gross (pre item- AND bill-discount) reconstructed from the raw inputs, independent of
    // compute.ts's own discountSatang math, then checked against discount + subtotal.
    expect(a.discountSatang + a.subtotalSatang).toBe(10000);
    expect(b.discountSatang + b.subtotalSatang).toBe(25000);
    expect(r.discountSatang + r.subtotalSatang).toBe(35000);
    // Charge chain is untouched by discountSatang: still sums exactly to each peer's total.
    expect(a.subtotalSatang + a.serviceChargeSatang + a.vatSatang).toBe(r.peerTotals.A);
    expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals.B);
    expect(a.discountSatang).toBe(1968); // was 1969
    expect(b.discountSatang).toBe(4031); // was 4030
    expect(r.discountSatang).toBe(6000);
  });

  it("canonical Katsu fixture: breakdown fields exist, peerTotals/checksum unchanged", () => {
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
    const r = computeBill(katsu);
    expect(r.peerTotals).toEqual({ A: 17910, B: 18720, C: 17910, D: 14310, E: 21420 });
    expect(r.checksumSatang).toBe(90270);
    expect(r.serviceChargeSatang).toBe(0);
    expect(r.vatSatang).toBe(0);
    for (const id of ["A", "B", "C", "D", "E"]) {
      const b = r.peerBreakdowns[id];
      expect(b.subtotalSatang).toBe(r.peerTotals[id]); // no SC/VAT on this fixture
      expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
    }
    // Every item carries a 10% discount, so discountSatang must be correct and non-zero:
    // each peer's gross (pre-discount) share minus their settled subtotal, e.g. D's only
    // item (Katsu ฿159.00) at 10% off is exactly ฿15.90 = 1590 satang.
    expect(r.discountSatang).toBe(10030);
    expect(r.peerBreakdowns.A.discountSatang).toBe(1990);
    expect(r.peerBreakdowns.B.discountSatang).toBe(2080);
    expect(r.peerBreakdowns.C.discountSatang).toBe(1990);
    expect(r.peerBreakdowns.D.discountSatang).toBe(1590);
    expect(r.peerBreakdowns.E.discountSatang).toBe(2380);
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
    expect(r.peerTotals).toEqual({ A: 9453, B: 24680 }); // was {A: 9453, B: 24681}
    expect(r.checksumSatang).toBe(34133); // was 34134
    expect(r.receiptTotalSatang).toBe(34133);
    expect(r.surplusSatang).toBe(0); // was 1
  });
});

describe("ADR-0011 two-tier rounding absorber", () => {
  it("cross-item independence: two different ticker groups each absorb their own leftover", () => {
    // item1 ฿100 ÷ A,B,C (leftover 1 → A); item2 ฿25 ÷ D,E,F (leftover 1 → D). No cross-contamination.
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["A", "B", "C"] },
        { id: "i2", unitPriceSatang: 2500, qty: 1, tickedBy: ["D", "E", "F"] },
      ],
      peerIds: ["A", "B", "C", "D", "E", "F"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.peerTotals).toEqual({ A: 3334, B: 3333, C: 3333, D: 834, E: 833, F: 833 });
    expect(r.checksumSatang).toBe(12500);
    expect(r.receiptTotalSatang).toBe(12500);
    expect(r.surplusSatang).toBe(0);
  });

  it("item-level roundingAbsorberPeerId overrides the default first ticker", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"], roundingAbsorberPeerId: "c" }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.peerTotals).toEqual({ a: 833, b: 833, c: 834 });
  });

  it("item-level absorber falls back to the first ticker when the stored id is stale", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"], roundingAbsorberPeerId: "ghost" }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.peerTotals).toEqual({ a: 834, b: 833, c: 833 });
  });

  it("bill-level roundingAbsorberPeerId overrides which peer takes the bill-tier remainder", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 10,
      vatPercent: 0,
      roundingAbsorberPeerId: "c",
    });
    expect(r.peerTotals).toEqual({ a: 917, b: 916, c: 917 }); // default (no override) would be {a:918,b:916,c:916}
    expect(r.checksumSatang).toBe(2750);
  });

  it("never lets a non-absorber peer's VAT residual go negative (SC-only compounding, VAT 0%)", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 10,
      vatPercent: 0,
    });
    expect(r.peerTotals).toEqual({ a: 918, b: 916, c: 916 });
    for (const id of ["a", "b", "c"]) {
      expect(r.peerBreakdowns[id].vatSatang).toBeGreaterThanOrEqual(0);
      const b = r.peerBreakdowns[id];
      expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
    }
  });

  it("negative-remainder guard: falls back to the largest-total peer rather than go negative", () => {
    // w ticks nothing (baseline 0) and is the designated bill-level absorber; three single-
    // ticker items each ceil up by ~1 satang, driving the bill-tier remainder to −2 — more
    // than w's ฿0 floor can absorb, so the guard reassigns it to the largest-floor peer instead.
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 97, qty: 1, discountPercent: 1, tickedBy: ["x"] },
        { id: "i2", unitPriceSatang: 97, qty: 1, discountPercent: 1, tickedBy: ["y"] },
        { id: "i3", unitPriceSatang: 97, qty: 1, discountPercent: 1, tickedBy: ["z"] },
      ],
      peerIds: ["w", "x", "y", "z"],
      serviceChargePercent: 0,
      vatPercent: 0,
      roundingAbsorberPeerId: "w",
    });
    expect(r.peerTotals.w).toBe(0); // never negative
    expect(Object.values(r.peerTotals).every((v) => v >= 0)).toBe(true);
    expect(r.checksumSatang).toBe(r.receiptTotalSatang);
    // The guard reassigned the absorber away from "w" (its floor can't cover the −2 remainder).
    expect(r.billLeftover).toEqual({ leftoverSatang: -2, absorberPeerId: "x" });
  });

  it("itemLeftovers only lists multi-ticker items with a nonzero leftover, keyed by item id", () => {
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["A", "B", "C"] }, // leftover 1 → A
        { id: "i2", unitPriceSatang: 2500, qty: 1, tickedBy: ["D", "E", "F"] }, // leftover 1 → D
        { id: "i3", unitPriceSatang: 3000, qty: 1, tickedBy: ["A", "B", "C"] }, // exact ÷ 3, no leftover
        { id: "i4", unitPriceSatang: 5000, qty: 1, tickedBy: ["A"] }, // single ticker, never listed
      ],
      peerIds: ["A", "B", "C", "D", "E", "F"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.itemLeftovers).toEqual({
      i1: { leftoverSatang: 1, absorberPeerId: "A" },
      i2: { leftoverSatang: 1, absorberPeerId: "D" },
    });
  });

  it("billLeftover is undefined when the bill tier's remainder is zero", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 30000, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.billLeftover).toBeUndefined();
  });

  it("billLeftover engages from item-tier ceiling overshoot alone, at SC = VAT = 0%", () => {
    // Same two-single-ticker-item overshoot fixture as the earlier bill-tier test.
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
    expect(r.billLeftover).toEqual({ leftoverSatang: -1, absorberPeerId: "x" });
  });

  it("billLeftover is undefined whenever any item is unticked (bill tier does not run)", () => {
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 1000, qty: 1, tickedBy: ["x"] },
        { id: "i2", unitPriceSatang: 2000, qty: 1, tickedBy: [] },
      ],
      peerIds: ["x", "y"],
      billDiscount: { amountSatang: 1000 },
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.billLeftover).toBeUndefined();
  });
});
