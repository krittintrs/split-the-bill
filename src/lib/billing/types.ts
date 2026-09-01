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
}

export interface PeerBreakdown {
  /** Their gross (pre item- AND bill-discount) even share, minus subtotalSatang. */
  discountSatang: number;
  /** Their exact item-share subtotal, after item AND bill discounts, before any charge. */
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
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
}
