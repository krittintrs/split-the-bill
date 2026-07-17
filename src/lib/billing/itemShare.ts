/** Display-only line total after the item's own discounts (percent then amount). */
export function itemTotalSatang(item: {
  unitPriceSatang: number;
  qty: number;
  discountPercent?: number;
  discountAmountSatang?: number;
}): number {
  const gross = item.unitPriceSatang * item.qty;
  const afterPercent = Math.round(gross * (1 - (item.discountPercent ?? 0) / 100));
  return afterPercent - (item.discountAmountSatang ?? 0);
}

/** Display-only per-ticker share of one line item (its own discounts applied). */
export function itemShareSatang(item: {
  unitPriceSatang: number;
  qty: number;
  discountPercent?: number;
  discountAmountSatang?: number;
  tickedBy: string[];
}): number | null {
  const n = item.tickedBy.length;
  if (n === 0) return null;
  return Math.ceil(itemTotalSatang(item) / n);
}
