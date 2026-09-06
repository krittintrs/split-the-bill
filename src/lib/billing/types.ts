export interface LineItemInput {
  id: string;
  unitPriceSatang: number;
  qty: number; // line total = unitPrice × qty
  discountPercent?: number; // integer 0-100, applied first (ADR-0003)
  discountAmountSatang?: number; // then subtracted
  tickedBy: string[]; // peer ids; [] = unticked
}

export interface BillDiscount {
  percent?: number; // integer 0-100, applied first
  amountSatang?: number; // applied after percent
}

export interface BillInput {
  items: LineItemInput[];
  peerIds: string[];
  billDiscount?: BillDiscount;
  serviceChargePercent: number; // integer 0-100
  vatPercent: number; // integer 0-100
  /**
   * ADR-0011: peer who keeps the bill-wide rounding discount (everyone else's independent
   * ceiling is subtracted from their total). Falls back to peerIds[0] if unset or stale.
   */
  roundingAbsorberPeerId?: string;
  /**
   * #38: the receipt's own currency when it isn't THB (e.g. "TWD"), free text, one per Bill.
   * Must be set together with fxRateNumerator/fxRateDenominator, or neither.
   */
  purchaseCurrency?: string;
  /**
   * #38: exact rate as an integer fraction — THB per 1 unit of purchaseCurrency.
   * e.g. "1 TWD = 1.15 THB" is numerator=115, denominator=100. Never a float.
   */
  fxRateNumerator?: number;
  fxRateDenominator?: number;
}

export interface PeerBreakdown {
  /** Their gross (pre item- AND bill-discount) even share, minus subtotalSatang. */
  discountSatang: number;
  /** Their exact item-share subtotal, after item AND bill discounts, before any charge. */
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
}

/**
 * #38: mirrors the top-level BillResult money fields, but in the Bill's Purchase Currency
 * before the FX Rate is applied. Field names keep the "Satang" suffix even though the unit
 * is the Purchase Currency's own minor unit (not THB satang) — reusing PeerBreakdown/the same
 * shape avoids a second parallel type family for a structure that never actually diverges.
 */
export interface PurchaseSideResult {
  currency: string;
  rateNumerator: number;
  rateDenominator: number;
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

export interface BillResult {
  /** The money truth: exact pipeline sum, ceil'd ONCE per peer (ADR-0001). */
  peerTotals: Record<string, number>;
  /** Sum of peerTotals — the sheet's Check sum. */
  checksumSatang: number;
  /** Exact bill total after the full pipeline, ceil'd once; compare vs paper receipt. */
  receiptTotalSatang: number;
  /** checksum − receiptTotal; negative when items are unticked (shortfall). */
  surplusSatang: number;
  /** DISPLAY ONLY: per-item per-peer share, each ceil'd independently; may sum slightly above peerTotal. */
  itemSplits: Record<string, Record<string, number>>;
  /** Items with tickedBy = [] — contribute ฿0; organizer must chase these. */
  untickedItemIds: string[];
  /**
   * Bill-level breakdown. subtotalSatang + serviceChargeSatang + vatSatang === receiptTotalSatang
   * exactly. discountSatang (gross pre-discount bill total minus subtotalSatang) is informational,
   * not part of that sum.
   */
  discountSatang: number;
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  /** Per peer. Each entry's three charge fields sum exactly to peerTotals[peerId]; discountSatang is informational (gross − subtotal), not part of that sum. */
  peerBreakdowns: Record<string, PeerBreakdown>;
  /**
   * ADR-0011 v2: the bill-wide rounding discount, present only when every item is ticked AND
   * the independent per-peer ceilings sum to more than the receipt (always >= 0 when present —
   * see compute.ts). Absent (undefined) whenever any item is unticked or nothing to round.
   */
  billLeftover: { leftoverSatang: number; absorberPeerId: string } | undefined;
  /** #38: present only when the Bill has a Purchase Currency + FX Rate. */
  purchase: PurchaseSideResult | undefined;
}
