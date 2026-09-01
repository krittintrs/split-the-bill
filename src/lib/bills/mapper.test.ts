import { describe, expect, it } from "vitest";
import { computeBill } from "../billing/compute";
import { mapToBillInput } from "./mapper";
import type { BillRow, LineItemRow, PeerRow, TickRow } from "./types";

const bill: BillRow = {
  id: "b1",
  restaurant: "Katsu",
  eaten_at: "2026-07-16",
  status: "draft",
  bill_discount_percent: 0,
  bill_discount_satang: 0,
  service_charge_percent: 0,
  vat_percent: 0,
  receipt_total_satang: 15000,
  promptpay_id: "",
  bank_name: "",
  bank_account: "",
  account_name: "",
  rounding_absorber_peer_id: null,
};

const items: LineItemRow[] = [
  // deliberately out of order: position decides
  { id: "i2", bill_id: "b1", name: "Add-on", unit_price_satang: 5000, qty: 1, discount_percent: 0, discount_satang: 0, position: 2 },
  { id: "i1", bill_id: "b1", name: "Katsu set", unit_price_satang: 10000, qty: 1, discount_percent: 0, discount_satang: 0, position: 1 },
];

const peers: PeerRow[] = [
  { id: "a", name: "Amy" },
  { id: "b", name: "Ben" },
];

const ticks: TickRow[] = [
  { line_item_id: "i1", peer_id: "a" },
  { line_item_id: "i1", peer_id: "b" },
  { line_item_id: "i2", peer_id: "a" },
];

describe("mapToBillInput", () => {
  it("produces a BillInput the engine accepts, with correct totals", () => {
    const result = computeBill(mapToBillInput(bill, items, peers, ticks, null));
    // i1 10000 split a+b (5000 each), i2 5000 to a
    expect(result.peerTotals).toEqual({ a: 10000, b: 5000 });
    expect(result.checksumSatang).toBe(15000);
  });

  it("passes zero discounts through as 0, not undefined", () => {
    const input = mapToBillInput(bill, items, peers, ticks, null);
    expect(input.items[0].discountPercent).toBe(0);
    expect(input.items[0].discountAmountSatang).toBe(0);
    expect(input.billDiscount).toEqual({ percent: 0, amountSatang: 0 });
  });

  it("orders items by position", () => {
    const input = mapToBillInput(bill, items, peers, ticks, null);
    expect(input.items.map((i) => i.id)).toEqual(["i1", "i2"]);
  });

  it("maps untick-ed items to an empty tickedBy", () => {
    const input = mapToBillInput(bill, items, peers, [], null);
    expect(input.items.every((i) => i.tickedBy.length === 0)).toBe(true);
    const result = computeBill(input);
    expect(result.untickedItemIds).toEqual(["i1", "i2"]);
  });
});
