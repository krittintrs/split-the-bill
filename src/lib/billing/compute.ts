import { add, ceilToSatang, frac, mul, ZERO, type Frac } from "./frac";
import type { BillInput, BillResult } from "./types";

export function computeBill(input: BillInput): BillResult {
  validate(input);

  // Per-item net line total after item discounts: % first, then amount (ADR-0003).
  const itemNet = new Map<string, Frac>();
  for (const item of input.items) {
    const line = BigInt(item.unitPriceSatang) * BigInt(item.qty);
    const pct = BigInt(item.discountPct ?? 0);
    const amt = BigInt(item.discountAmountSatang ?? 0);
    let num = line * (100n - pct) - amt * 100n;
    if (num < 0n) num = 0n; // over-discount while editing: item clamps to ฿0
    itemNet.set(item.id, frac(num, 100n));
  }

  let subtotal = ZERO;
  for (const net of itemNet.values()) subtotal = add(subtotal, net);

  // Bill discount becomes one ratio applied to every item: proportional allocation (ADR-0003).
  let ratio = frac(1n);
  if (input.billDiscount && subtotal.num > 0n) {
    const pct = BigInt(input.billDiscount.pct ?? 0);
    const amt = BigInt(input.billDiscount.amountSatang ?? 0);
    // discounted subtotal S' = S×(100−pct)/100 − amt; ratio = S'/S (S's den cancels)
    let num = subtotal.num * (100n - pct) - amt * 100n * subtotal.den;
    if (num < 0n) num = 0n; // bill over-discount while editing: bill clamps to ฿0
    ratio = frac(num, 100n * subtotal.num);
  }
  // × (1 + SC%) × (1 + VAT%), compounded in that order (ADR-0003).
  const charge = frac(
    BigInt(100 + input.serviceChargePct) * BigInt(100 + input.vatPct),
    10000n,
  );

  const peerTotalFracs = new Map<string, Frac>(input.peerIds.map((id) => [id, ZERO]));
  const itemSplits: Record<string, Record<string, number>> = {};
  const untickedItemIds: string[] = [];

  for (const item of input.items) {
    itemSplits[item.id] = {};
    if (item.tickedBy.length === 0) {
      untickedItemIds.push(item.id);
      continue;
    }
    const net = itemNet.get(item.id)!;
    const share = mul(
      frac(net.num, net.den * BigInt(item.tickedBy.length)),
      mul(ratio, charge),
    );
    for (const peerId of item.tickedBy) {
      peerTotalFracs.set(peerId, add(peerTotalFracs.get(peerId)!, share));
      itemSplits[item.id][peerId] = ceilToSatang(share); // display only, rounded per cell
    }
  }

  const peerTotals: Record<string, number> = {};
  let checksumSatang = 0;
  for (const [peerId, total] of peerTotalFracs) {
    peerTotals[peerId] = ceilToSatang(total); // the single money rounding (ADR-0001)
    checksumSatang += peerTotals[peerId];
  }

  const receiptTotalSatang = ceilToSatang(mul(subtotal, mul(ratio, charge)));

  return {
    peerTotals,
    checksumSatang,
    receiptTotalSatang,
    surplusSatang: checksumSatang - receiptTotalSatang,
    itemSplits,
    untickedItemIds,
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
