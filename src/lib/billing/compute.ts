import { add, ceilToSatang, floorToSatang, fraction, multiply, ZERO, type Fraction } from "./fraction";
import type { BillInput, BillResult, PeerBreakdown } from "./types";

export function computeBill(input: BillInput): BillResult {
  validate(input);

  // 1. Per-item net price: unitPrice × qty, minus item discounts — % first, then amount (ADR-0003).
  //    grossPrices keeps the pre-ANY-discount line total (unitPrice × qty) for the ส่วนลด row.
  const netPrices = new Map<string, Fraction>();
  const grossPrices = new Map<string, bigint>();
  for (const item of input.items) {
    const lineTotal = BigInt(item.unitPriceSatang) * BigInt(item.qty);
    grossPrices.set(item.id, lineTotal);
    const discountPercent = BigInt(item.discountPercent ?? 0);
    const discountAmount = BigInt(item.discountAmountSatang ?? 0);
    // net = lineTotal × (100 − %) / 100 − amount, carried over denominator 100
    let netTimes100 = lineTotal * (100n - discountPercent) - discountAmount * 100n;
    if (netTimes100 < 0n) netTimes100 = 0n; // over-discount while editing: item clamps to ฿0
    netPrices.set(item.id, fraction(netTimes100, 100n));
  }

  // 2. Subtotal = sum of all net prices (the "Discounted price" row of the old sheet).
  //    Gross bill total = sum of all pre-discount line totals, for the bill-level discountSatang.
  let subtotal = ZERO;
  for (const netPrice of netPrices.values()) subtotal = add(subtotal, netPrice);
  let grossBillSatang = 0n;
  for (const gross of grossPrices.values()) grossBillSatang += gross;

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

  // 5. Item tier (ADR-0011): each ticked item's exact post-discount cost is ceil'd ONCE, then
  //    handed out by flooring every ticker's share and giving the item's own leftover (0 ..
  //    tickerCount−1 satang) to that item's designated absorbing ticker (default: first ticker,
  //    organizer-overridable per item, falling back to the first ticker if the stored id is stale
  //    or not one of that item's tickers). A 1-ticker item degenerates to exactly the old
  //    per-item ceiling — the only ticker IS the absorber.
  //    peerSubtotalFractions stays the EXACT per-peer subtotal (unchanged from today) — it feeds
  //    discountSatang and is the fallback pipeline whenever any item is unticked (untouched path).
  //    peerItemTierSatang is the new per-peer INTEGER subtotal built from item-tier shares, used
  //    by the ADR-0011 bill tier below once every item is ticked.
  //    Unticked items contribute ฿0 and get flagged for the organizer to chase.
  const peerSubtotalFractions = new Map<string, Fraction>(
    input.peerIds.map((id) => [id, ZERO]),
  );
  const peerGrossFractions = new Map<string, Fraction>(
    input.peerIds.map((id) => [id, ZERO]),
  );
  const peerItemTierSatang = new Map<string, number>(input.peerIds.map((id) => [id, 0]));
  const itemSplits: Record<string, Record<string, number>> = {};
  const itemLeftovers: Record<string, { leftoverSatang: number; absorberPeerId: string }> = {};
  const untickedItemIds: string[] = [];

  for (const item of input.items) {
    itemSplits[item.id] = {};
    if (item.tickedBy.length === 0) {
      untickedItemIds.push(item.id);
      continue;
    }
    const netPrice = netPrices.get(item.id)!;
    const grossPrice = grossPrices.get(item.id)!;
    const tickerCount = BigInt(item.tickedBy.length);
    const perTickerSubtotal = multiply(
      fraction(netPrice.numerator, netPrice.denominator * tickerCount),
      billDiscountRatio,
    );
    const perTickerGross = fraction(grossPrice, tickerCount);

    // Item tier: ceil the item's own exact chargeable amount once, then floor+remainder it out.
    const itemChargeableExact = multiply(netPrice, billDiscountRatio);
    const itemTotalSatang = ceilToSatang(itemChargeableExact);
    const perTickerExact = fraction(
      itemChargeableExact.numerator,
      itemChargeableExact.denominator * tickerCount,
    );
    const floorShare = floorToSatang(perTickerExact);
    const itemRemainder = itemTotalSatang - floorShare * item.tickedBy.length;
    const itemAbsorberId =
      item.roundingAbsorberPeerId !== undefined && item.tickedBy.includes(item.roundingAbsorberPeerId)
        ? item.roundingAbsorberPeerId
        : item.tickedBy[0];

    for (const peerId of item.tickedBy) {
      peerSubtotalFractions.set(peerId, add(peerSubtotalFractions.get(peerId)!, perTickerSubtotal));
      peerGrossFractions.set(peerId, add(peerGrossFractions.get(peerId)!, perTickerGross));
      const share = floorShare + (peerId === itemAbsorberId ? itemRemainder : 0);
      itemSplits[item.id][peerId] = share;
      peerItemTierSatang.set(peerId, peerItemTierSatang.get(peerId)! + share);
    }

    // Task 5 UI hook: only items with 2+ tickers AND a nonzero leftover need a picker at all.
    if (item.tickedBy.length >= 2 && itemRemainder !== 0) {
      itemLeftovers[item.id] = { leftoverSatang: itemRemainder, absorberPeerId: itemAbsorberId };
    }
  }

  // 6. Bill-level pipeline: whole bill through subtotal → +SC → +VAT, ceiling once per stage;
  //    VAT is the residual so the three displayed lines always sum exactly to the total. This is
  //    independent of any peer split (it's derived straight from the aggregate `subtotal`), so
  //    it's computed once here and reused both as the receipt-vs-checksum comparison and as the
  //    ADR-0011 bill tier's remainder target below.
  //    discountSatang here is the bill-wide gross (all items, exact integer, no discount) minus
  //    the settled subtotal — informational, not part of the subtotal/SC/VAT chain.
  const subtotalExactBill = multiply(subtotal, billDiscountRatio);
  const withScExactBill = multiply(subtotalExactBill, scRatio);
  const withVatExactBill = multiply(withScExactBill, vatRatio);
  const subtotalSatang = ceilToSatang(subtotalExactBill);
  const discountSatang = Number(grossBillSatang) - subtotalSatang;
  const serviceChargeSatang = ceilToSatang(withScExactBill) - subtotalSatang;
  const receiptTotalSatang = ceilToSatang(withVatExactBill);
  const vatSatang = receiptTotalSatang - subtotalSatang - serviceChargeSatang;

  // 7. Per-peer totals. Unticked items keep today's flat per-peer ceiling pipeline completely
  //    untouched (each stage ceil'd independently from the peer's EXACT fraction subtotal); once
  //    every item is ticked, use the ADR-0011 bill tier instead: floor each peer's staged total,
  //    then hand the bill-wide remainder (can be negative — item-tier ceiling overshoot, see
  //    ADR-0011) to one designated absorbing peer (default: the organizer's self-peer, resolved
  //    by the caller; falls back to the first peer), guarded so a peer's total never goes
  //    negative — if the designated absorber can't safely absorb a negative remainder, fall back
  //    to whichever peer has the largest floor total instead.
  const peerTotals: Record<string, number> = {};
  const peerBreakdowns: Record<string, PeerBreakdown> = {};
  let checksumSatang = 0;
  let billLeftover: { leftoverSatang: number; absorberPeerId: string } | undefined;

  if (untickedItemIds.length === 0) {
    const floorTotals = new Map<string, number>();
    const subtotalOf = new Map<string, number>();
    const scOf = new Map<string, number>();
    for (const [peerId, peerSubtotalSatang] of peerItemTierSatang) {
      const subtotalExact = fraction(BigInt(peerSubtotalSatang));
      const withScExact = multiply(subtotalExact, scRatio);
      const withVatExact = multiply(withScExact, vatRatio);
      floorTotals.set(peerId, floorToSatang(withVatExact));
      subtotalOf.set(peerId, peerSubtotalSatang);
      scOf.set(peerId, floorToSatang(withScExact) - peerSubtotalSatang);
    }

    let floorSum = 0;
    for (const v of floorTotals.values()) floorSum += v;
    const remainder = receiptTotalSatang - floorSum; // can be negative — see ADR-0011

    let billAbsorberId =
      input.roundingAbsorberPeerId !== undefined &&
      input.peerIds.includes(input.roundingAbsorberPeerId)
        ? input.roundingAbsorberPeerId
        : input.peerIds[0];

    if (remainder < 0 && (floorTotals.get(billAbsorberId) ?? 0) + remainder < 0) {
      let largestPeerId = billAbsorberId;
      let largestFloor = -Infinity;
      for (const [peerId, floorTotal] of floorTotals) {
        if (floorTotal > largestFloor) {
          largestFloor = floorTotal;
          largestPeerId = peerId;
        }
      }
      billAbsorberId = largestPeerId;
    }

    // Task 5 UI hook: only a nonzero remainder needs a picker — NOT the same as "SC or VAT is
    // nonzero" (item-tier ceiling overshoot alone can make this nonzero at 0%/0%, see ADR-0011).
    if (remainder !== 0) {
      billLeftover = { leftoverSatang: remainder, absorberPeerId: billAbsorberId };
    }

    for (const [peerId, floorTotal] of floorTotals) {
      const total = floorTotal + (peerId === billAbsorberId ? remainder : 0);
      const peerSubtotalSatang = subtotalOf.get(peerId)!;
      const peerScSatang = scOf.get(peerId)!;
      // Known limitation (ADR-0011): when the guard above reassigns a large negative adjustment
      // onto a peer whose own item-tier subtotal is small relative to it, their DISPLAYED
      // vatSatang residual can come out negative even though `total` itself never does. Clamp at
      // the display edge (UI), not here — the underlying total is always correct.
      const peerVatSatang = total - peerSubtotalSatang - peerScSatang;
      const peerGrossSatang = ceilToSatang(peerGrossFractions.get(peerId)!);

      peerTotals[peerId] = total;
      peerBreakdowns[peerId] = {
        discountSatang: peerGrossSatang - peerSubtotalSatang,
        subtotalSatang: peerSubtotalSatang,
        serviceChargeSatang: peerScSatang,
        vatSatang: peerVatSatang,
      };
      checksumSatang += total;
    }
  } else {
    // Untouched: today's flat per-peer ceiling, one ceil per stage from the exact fraction sum.
    for (const [peerId, subtotalExact] of peerSubtotalFractions) {
      const grossExact = peerGrossFractions.get(peerId)!;
      const withScExact = multiply(subtotalExact, scRatio);
      const withVatExact = multiply(withScExact, vatRatio);

      const peerGrossSatang = ceilToSatang(grossExact);
      const peerSubtotalSatang = ceilToSatang(subtotalExact);
      const peerDiscountSatang = peerGrossSatang - peerSubtotalSatang;
      const peerScSatang = ceilToSatang(withScExact) - peerSubtotalSatang;
      const total = ceilToSatang(withVatExact);
      const peerVatSatang = total - peerSubtotalSatang - peerScSatang;

      peerTotals[peerId] = total;
      peerBreakdowns[peerId] = {
        discountSatang: peerDiscountSatang,
        subtotalSatang: peerSubtotalSatang,
        serviceChargeSatang: peerScSatang,
        vatSatang: peerVatSatang,
      };
      checksumSatang += total;
    }
  }

  return {
    peerTotals,
    checksumSatang,
    receiptTotalSatang,
    surplusSatang: checksumSatang - receiptTotalSatang,
    itemSplits,
    untickedItemIds,
    discountSatang,
    subtotalSatang,
    serviceChargeSatang,
    vatSatang,
    peerBreakdowns,
    itemLeftovers,
    billLeftover,
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
