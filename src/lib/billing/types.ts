export interface LineItemInput {
  id: string;
  unitPriceSatang: number;
  qty: number; // line total = unitPrice × qty
  discountPct?: number; // integer 0-100, applied first (ADR-0003)
  discountAmountSatang?: number; // then subtracted
  tickedBy: string[]; // peer ids; [] = unticked
}

export interface BillDiscount {
  pct?: number; // integer 0-100, applied first
  amountSatang?: number; // applied after pct
}

export interface BillInput {
  items: LineItemInput[];
  peerIds: string[];
  billDiscount?: BillDiscount;
  serviceChargePct: number; // integer 0-100
  vatPct: number; // integer 0-100
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
  /** DISPLAY ONLY: per-item per-peer share, each ceil'd; may sum slightly above peerTotal. */
  itemSplits: Record<string, Record<string, number>>;
  /** Items with tickedBy = [] — contribute ฿0; organizer must chase these. */
  untickedItemIds: string[];
}
