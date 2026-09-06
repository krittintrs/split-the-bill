function formatMajor(amountMinor: number, label: string): string {
  if (!Number.isInteger(amountMinor)) throw new Error(`${label} must be an integer`);
  return (amountMinor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatSatang(satang: number): string {
  return `฿${formatMajor(satang, "satang")}`;
}

export function formatMinorUnits(amountMinor: number, currencyCode: string): string {
  return `${currencyCode} ${formatMajor(amountMinor, "amountMinor")}`;
}

/**
 * Same formatting as formatSatang/formatMinorUnits, without the currency prefix — for a
 * second figure on the same line where an earlier figure already established the currency
 * (repeating it there was what forced PeerBill's item column to wrap line-by-line, #38).
 */
export function formatAmount(amountMinor: number): string {
  return formatMajor(amountMinor, "amountMinor");
}
