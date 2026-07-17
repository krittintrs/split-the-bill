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
  const gross = item.unitPriceSatang * item.qty;
  const afterPercent = Math.round(gross * (1 - (item.discountPercent ?? 0) / 100));
  const total = afterPercent - (item.discountAmountSatang ?? 0);
  return Math.ceil(total / n);
}
