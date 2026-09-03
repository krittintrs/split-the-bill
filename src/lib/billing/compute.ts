import { add, ceilToSatang, fraction, multiply, ONE, ZERO, type Fraction } from "./fraction";
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

  // 5. Per-peer subtotal: item shares (after item + bill discounts), exact, no charges yet.
  //    Per-peer gross: the same even split, but on the pre-ANY-discount line total — used only
  //    to derive discountSatang below, never added into a peer's charged total.
  //    itemSplits is DISPLAY ONLY: raw pre-SC/VAT per-ticker share (matches itemShare.ts's
  //    convention — item price after its own discount, divided by ticker count, no charges),
  //    each cell ceil'd independently, may sum slightly above a peer's actual subtotal — there
  //    is no per-item rounding tier (ADR-0011 v2 dropped it; see the ADR for why a single
  //    bill-wide adjustment no longer needs per-item attribution).
  //    Unticked items contribute ฿0 and get flagged for the organizer to chase.
  const peerSubtotalFractions = new Map<string, Fraction>(
    input.peerIds.map((id) => [id, ZERO]),
  );
  const peerGrossFractions = new Map<string, Fraction>(
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
    const grossPrice = grossPrices.get(item.id)!;
    const tickerCount = BigInt(item.tickedBy.length);
    const perTickerSubtotal = multiply(
      fraction(netPrice.numerator, netPrice.denominator * tickerCount),
      billDiscountRatio,
    );
    const perTickerGross = fraction(grossPrice, tickerCount);
    const perTickerShare = perTickerSubtotal;
    for (const peerId of item.tickedBy) {
      peerSubtotalFractions.set(peerId, add(peerSubtotalFractions.get(peerId)!, perTickerSubtotal));
      peerGrossFractions.set(peerId, add(peerGrossFractions.get(peerId)!, perTickerGross));
      itemSplits[item.id][peerId] = ceilToSatang(perTickerShare); // display only, rounded per cell
    }
  }

  // 6. Settle at two scales: identity (Purchase Currency, unaffected by FX) and, when a
  //    Purchase Currency is set, the FX Rate (THB — the only scale that ever settles a debt).
  //    Same mechanism both times (ADR-0011's single absorber), just fed a different ratio.
  const hasFx = input.purchaseCurrency !== undefined;
  const fxRatio = hasFx
    ? fraction(BigInt(input.fxRateNumerator!), BigInt(input.fxRateDenominator!))
    : ONE;

  const common = {
    subtotal,
    grossBillSatang,
    billDiscountRatio,
    scRatio,
    vatRatio,
    peerIds: input.peerIds,
    peerSubtotalFractions,
    peerGrossFractions,
    untickedItemIds,
    roundingAbsorberPeerId: input.roundingAbsorberPeerId,
  };
  const purchaseSide = settleAtScale({ ...common, ratio: ONE });
  const thbSide = hasFx ? settleAtScale({ ...common, ratio: fxRatio }) : purchaseSide;

  return {
    peerTotals: thbSide.peerTotals,
    checksumSatang: thbSide.checksumSatang,
    receiptTotalSatang: thbSide.receiptTotalSatang,
    surplusSatang: thbSide.surplusSatang,
    itemSplits,
    untickedItemIds,
    discountSatang: thbSide.discountSatang,
    subtotalSatang: thbSide.subtotalSatang,
    serviceChargeSatang: thbSide.serviceChargeSatang,
    vatSatang: thbSide.vatSatang,
    peerBreakdowns: thbSide.peerBreakdowns,
    billLeftover: thbSide.billLeftover,
    purchase: hasFx
      ? {
          currency: input.purchaseCurrency!,
          rateNumerator: input.fxRateNumerator!,
          rateDenominator: input.fxRateDenominator!,
          ...purchaseSide,
        }
      : undefined,
  };
}

interface SettleArgs {
  subtotal: Fraction;
  grossBillSatang: bigint;
  billDiscountRatio: Fraction;
  scRatio: Fraction;
  vatRatio: Fraction;
  ratio: Fraction;
  peerIds: string[];
  peerSubtotalFractions: Map<string, Fraction>;
  peerGrossFractions: Map<string, Fraction>;
  untickedItemIds: string[];
  roundingAbsorberPeerId: string | undefined;
}

interface SettledScale {
  peerTotals: Record<string, number>;
  checksumSatang: number;
  receiptTotalSatang: number;
  surplusSatang: number;
  discountSatang: number;
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  peerBreakdowns: Record<string, PeerBreakdown>;
  billLeftover: { leftoverSatang: number; absorberPeerId: string } | undefined;
}

/**
 * ADR-0011's mechanism (per-peer independent ceiling + one absorbed leftover), generalized
 * with a `ratio` multiplied in before every ceiling (#38). `ratio = ONE` reproduces exactly
 * what this engine computed before #38 existed — this is the whole regression guarantee.
 */
function settleAtScale(args: SettleArgs): SettledScale {
  const {
    subtotal,
    grossBillSatang,
    billDiscountRatio,
    scRatio,
    vatRatio,
    ratio,
    peerIds,
    peerSubtotalFractions,
    peerGrossFractions,
    untickedItemIds,
    roundingAbsorberPeerId,
  } = args;

  // Bill-level: whole bill through ×billDiscount → ×ratio → +SC → +VAT, ceiling once per stage.
  const grossBillExactBill = multiply(fraction(grossBillSatang), ratio);
  const subtotalExactBill = multiply(multiply(subtotal, billDiscountRatio), ratio);
  const withScExactBill = multiply(subtotalExactBill, scRatio);
  const withVatExactBill = multiply(withScExactBill, vatRatio);
  const subtotalSatang = ceilToSatang(subtotalExactBill);
  const discountSatang = ceilToSatang(grossBillExactBill) - subtotalSatang;
  const serviceChargeSatang = ceilToSatang(withScExactBill) - subtotalSatang;
  const receiptTotalSatang = ceilToSatang(withVatExactBill);
  const vatSatang = receiptTotalSatang - subtotalSatang - serviceChargeSatang;

  // Per-peer: stage each peer's exact share through ×ratio → +SC → +VAT, ceiling once per
  // stage (ADR-0001), then subtract the bill-wide leftover from one designated peer (ADR-0011).
  const peerTotals: Record<string, number> = {};
  const peerBreakdowns: Record<string, PeerBreakdown> = {};
  const ceilTotals = new Map<string, number>();
  const ceilSubtotals = new Map<string, number>();
  const ceilScs = new Map<string, number>();
  const ceilGrosses = new Map<string, number>();
  let checksumRaw = 0;

  for (const peerId of peerIds) {
    const subtotalExact = multiply(peerSubtotalFractions.get(peerId)!, ratio);
    const grossExact = multiply(peerGrossFractions.get(peerId)!, ratio);
    const withScExact = multiply(subtotalExact, scRatio);
    const withVatExact = multiply(withScExact, vatRatio);

    const peerGrossSatang = ceilToSatang(grossExact);
    const peerSubtotalSatang = ceilToSatang(subtotalExact);
    const peerScSatang = ceilToSatang(withScExact) - peerSubtotalSatang;
    const total = ceilToSatang(withVatExact);

    ceilTotals.set(peerId, total);
    ceilSubtotals.set(peerId, peerSubtotalSatang);
    ceilScs.set(peerId, peerScSatang);
    ceilGrosses.set(peerId, peerGrossSatang);
    checksumRaw += total;
  }

  const allTicked = untickedItemIds.length === 0;
  let leftover = 0;
  let billDiscountAbsorberId: string | undefined;

  if (allTicked) {
    leftover = checksumRaw - receiptTotalSatang; // always >= 0 — see comment above
    let absorberId =
      roundingAbsorberPeerId !== undefined && peerIds.includes(roundingAbsorberPeerId)
        ? roundingAbsorberPeerId
        : peerIds[0];

    if (leftover > (ceilTotals.get(absorberId) ?? 0)) {
      let largestId = absorberId;
      let largestTotal = -Infinity;
      for (const [peerId, total] of ceilTotals) {
        if (total > largestTotal) {
          largestTotal = total;
          largestId = peerId;
        }
      }
      absorberId = largestId;
    }
    billDiscountAbsorberId = absorberId;
  }

  let checksumSatang = 0;
  for (const [peerId, ceilTotal] of ceilTotals) {
    const total = ceilTotal - (peerId === billDiscountAbsorberId ? leftover : 0);
    const peerSubtotalSatang = ceilSubtotals.get(peerId)!;
    const peerScSatang = ceilScs.get(peerId)!;
    // Known limitation (ADR-0011 v2): for the peer whose total absorbs the discount, the
    // DISPLAYED vatSatang residual can come out negative even though `total` itself never does
    // (subtotal/SC stay ceil'd independently, unaffected by the subtraction). Clamp at the
    // display edge (UI), not here — same clamp already in place from v1, unaffected by this
    // change since it only ever reads the sign of the final value.
    const peerVatSatang = total - peerSubtotalSatang - peerScSatang;

    peerTotals[peerId] = total;
    peerBreakdowns[peerId] = {
      discountSatang: ceilGrosses.get(peerId)! - peerSubtotalSatang,
      subtotalSatang: peerSubtotalSatang,
      serviceChargeSatang: peerScSatang,
      vatSatang: peerVatSatang,
    };
    checksumSatang += total;
  }

  const billLeftover =
    allTicked && leftover !== 0
      ? { leftoverSatang: leftover, absorberPeerId: billDiscountAbsorberId! }
      : undefined;

  return {
    peerTotals,
    checksumSatang,
    receiptTotalSatang,
    surplusSatang: checksumSatang - receiptTotalSatang,
    discountSatang,
    subtotalSatang,
    serviceChargeSatang,
    vatSatang,
    peerBreakdowns,
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

  // 4. FX (#38): purchaseCurrency and fxRate must both be present or both absent.
  const hasCurrency = input.purchaseCurrency !== undefined;
  const hasRate = input.fxRateNumerator !== undefined || input.fxRateDenominator !== undefined;
  if (hasCurrency !== hasRate)
    throw new Error("purchaseCurrency and fxRateNumerator/fxRateDenominator must be set together");
  if (hasCurrency) {
    if (input.purchaseCurrency!.trim().length === 0)
      throw new Error("purchaseCurrency must not be empty");
    assertPositiveInt(input.fxRateNumerator!, "fxRateNumerator");
    assertPositiveInt(input.fxRateDenominator!, "fxRateDenominator");
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

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}
