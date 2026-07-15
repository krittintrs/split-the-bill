import type { BillInput, BillResult } from "./types";

export function computeBill(input: BillInput): BillResult {
  validate(input);
  const peerTotals: Record<string, number> = {};
  for (const id of input.peerIds) peerTotals[id] = 0;
  return {
    peerTotals,
    checksumSatang: 0,
    receiptTotalSatang: 0,
    surplusSatang: 0,
    itemSplits: {},
    untickedItemIds: [],
  };
}

function validate(input: BillInput): void {
  const peerSet = new Set(input.peerIds);
  if (peerSet.size !== input.peerIds.length) throw new Error("duplicate peerIds");
  assertPct(input.serviceChargePct, "serviceChargePct");
  assertPct(input.vatPct, "vatPct");
  if (input.billDiscount?.pct !== undefined) assertPct(input.billDiscount.pct, "billDiscount.pct");
  if (input.billDiscount?.amountSatang !== undefined)
    assertSatang(input.billDiscount.amountSatang, "billDiscount.amountSatang");
  const seenIds = new Set<string>();
  for (const item of input.items) {
    if (seenIds.has(item.id)) throw new Error(`duplicate item id: ${item.id}`);
    seenIds.add(item.id);
    assertSatang(item.unitPriceSatang, `item ${item.id} unitPriceSatang`);
    if (!Number.isInteger(item.qty) || item.qty < 1)
      throw new Error(`item ${item.id} qty must be a positive integer`);
    if (item.discountPct !== undefined) assertPct(item.discountPct, `item ${item.id} discountPct`);
    if (item.discountAmountSatang !== undefined)
      assertSatang(item.discountAmountSatang, `item ${item.id} discountAmountSatang`);
    const seenPeers = new Set<string>();
    for (const peerId of item.tickedBy) {
      if (!peerSet.has(peerId)) throw new Error(`item ${item.id} ticked by unknown peer: ${peerId}`);
      if (seenPeers.has(peerId)) throw new Error(`item ${item.id} ticked twice by: ${peerId}`);
      seenPeers.add(peerId);
    }
  }
}

function assertSatang(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer satang`);
}

function assertPct(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new Error(`${label} must be an integer 0-100`);
}
