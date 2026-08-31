import { add, ceilToSatang, fraction, multiply, ZERO, type Fraction } from "./fraction";
import type { BillInput, BillResult, PeerBreakdown } from "./types";

export function computeBill(input: BillInput): BillResult {
  validate(input);

  // 1. Per-item net price: unitPrice × qty, minus item discounts — % first, then amount (ADR-0003).
  const netPrices = new Map<string, Fraction>();
  for (const item of input.items) {
    const lineTotal = BigInt(item.unitPriceSatang) * BigInt(item.qty);
    const discountPercent = BigInt(item.discountPercent ?? 0);
    const discountAmount = BigInt(item.discountAmountSatang ?? 0);
    // net = lineTotal × (100 − %) / 100 − amount, carried over denominator 100
    let netTimes100 = lineTotal * (100n - discountPercent) - discountAmount * 100n;
    if (netTimes100 < 0n) netTimes100 = 0n; // over-discount while editing: item clamps to ฿0
    netPrices.set(item.id, fraction(netTimes100, 100n));
  }

  // 2. Subtotal = sum of all net prices (the "Discounted price" row of the old sheet).
  let subtotal = ZERO;
  for (const netPrice of netPrices.values()) subtotal = add(subtotal, netPrice);

  // 3. Bill-level discount becomes one ratio applied to every item:
  //    proportional allocation (ADR-0003). ratio = discounted subtotal ÷ original subtotal.
  let billDiscountRatio = fraction(1n);
  if (input.billDiscount && subtotal.numerator > 0n) {
    const billDiscountPercent = BigInt(input.billDiscount.percent ?? 0);
    const billDiscountAmount = BigInt(input.billDiscount.amountSatang ?? 0);
    // discounted subtotal = subtotal × (100 − %) / 100 − amount
    let discountedNumerator =
      subtotal.numerator * (100n - billDiscountPercent) -
      billDiscountAmount * 100n * subtotal.denominator;
    if (discountedNumerator < 0n) discountedNumerator = 0n; // bill over-discount clamps to ฿0
    billDiscountRatio = fraction(discountedNumerator, 100n * subtotal.numerator);
  }

  // 4. Charges: × (1 + SC%) then × (1 + VAT%), compounded in that order (ADR-0003).
  const scRatio = fraction(BigInt(100 + input.serviceChargePercent), 100n);
  const vatRatio = fraction(BigInt(100 + input.vatPercent), 100n);

  // 5. Per-peer subtotal: item shares (after item + bill discounts), exact, no charges yet.
  //    Also split each item evenly among its tickers for the display-only itemSplits grid.
  //    Unticked items contribute ฿0 and get flagged for the organizer to chase.
  const peerSubtotalFractions = new Map<string, Fraction>(
    input.peerIds.map((id) => [id, ZERO]),
  );
  const itemSplits: Record<string, Record<string, number>> = {};
  const untickedItemIds: string[] = [];

  for (const item of input.items) {
    itemSplits[item.id] = {};
    if (item.tickedBy.length === 0) {
      untickedItemIds.push(item.id);
      continue;
    }
    const netPrice = netPrices.get(item.id)!;
    const perTickerSubtotal = multiply(
      fraction(netPrice.numerator, netPrice.denominator * BigInt(item.tickedBy.length)),
      billDiscountRatio,
    );
    const perTickerShare = multiply(perTickerSubtotal, multiply(scRatio, vatRatio));
    for (const peerId of item.tickedBy) {
      peerSubtotalFractions.set(peerId, add(peerSubtotalFractions.get(peerId)!, perTickerSubtotal));
      itemSplits[item.id][peerId] = ceilToSatang(perTickerShare); // display only, rounded per cell
    }
  }

  // 6. Stage each peer through subtotal → +SC → +VAT, ceiling once per stage; VAT is the
  //    residual so the three displayed lines always sum exactly to the final total.
  const peerTotals: Record<string, number> = {};
  const peerBreakdowns: Record<string, PeerBreakdown> = {};
  let checksumSatang = 0;

  for (const [peerId, subtotalExact] of peerSubtotalFractions) {
    const withScExact = multiply(subtotalExact, scRatio);
    const withVatExact = multiply(withScExact, vatRatio);

    const peerSubtotalSatang = ceilToSatang(subtotalExact);
    const peerScSatang = ceilToSatang(withScExact) - peerSubtotalSatang;
    const total = ceilToSatang(withVatExact);
    const peerVatSatang = total - peerSubtotalSatang - peerScSatang;

    peerTotals[peerId] = total;
    peerBreakdowns[peerId] = {
      subtotalSatang: peerSubtotalSatang,
      serviceChargeSatang: peerScSatang,
      vatSatang: peerVatSatang,
    };
    checksumSatang += total;
  }

  // 7. Receipt total = whole bill through the same pipeline, for checking vs the paper receipt.
  //    Same residual convention as each peer: subtotal → +SC ceil'd → VAT is the residual.
  const subtotalExactBill = multiply(subtotal, billDiscountRatio);
  const withScExactBill = multiply(subtotalExactBill, scRatio);
  const withVatExactBill = multiply(withScExactBill, vatRatio);
  const subtotalSatang = ceilToSatang(subtotalExactBill);
  const serviceChargeSatang = ceilToSatang(withScExactBill) - subtotalSatang;
  const receiptTotalSatang = ceilToSatang(withVatExactBill);
  const vatSatang = receiptTotalSatang - subtotalSatang - serviceChargeSatang;

  return {
    peerTotals,
    checksumSatang,
    receiptTotalSatang,
    surplusSatang: checksumSatang - receiptTotalSatang,
    itemSplits,
    untickedItemIds,
    subtotalSatang,
    serviceChargeSatang,
    vatSatang,
    peerBreakdowns,
  };
}

// Malformed input = a code bug somewhere else, so throw loudly.
// (Incomplete-while-editing states never throw — computeBill handles them gracefully.)
function validate(input: BillInput): void {
  // 1. Peer ids must be unique.
  const peerSet = new Set(input.peerIds);
  if (peerSet.size !== input.peerIds.length) throw new Error("duplicate peerIds");

  // 2. Bill-level rates and discount must be in range.
  assertPercent(input.serviceChargePercent, "serviceChargePercent");
  assertPercent(input.vatPercent, "vatPercent");

  if (input.billDiscount?.percent !== undefined)
    assertPercent(input.billDiscount.percent, "billDiscount.percent");

  if (input.billDiscount?.amountSatang !== undefined)
    assertSatang(input.billDiscount.amountSatang, "billDiscount.amountSatang");

  // 3. Each item: unique id, valid money/qty/discounts, ticks only by known peers, no double tick.
  const seenIds = new Set<string>();
  for (const item of input.items) {
    if (seenIds.has(item.id)) throw new Error(`duplicate item id: ${item.id}`);
    seenIds.add(item.id);

    assertSatang(item.unitPriceSatang, `item ${item.id} unitPriceSatang`);

    if (!Number.isInteger(item.qty) || item.qty < 1)
      throw new Error(`item ${item.id} qty must be a positive integer`);

    if (item.discountPercent !== undefined)
      assertPercent(item.discountPercent, `item ${item.id} discountPercent`);

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

function assertPercent(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new Error(`${label} must be an integer 0-100`);
}
