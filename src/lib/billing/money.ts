export function formatSatang(satang: number): string {
  if (!Number.isInteger(satang)) throw new Error("satang must be an integer");
  const baht = satang / 100;
  return `฿${baht.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatMinorUnits(amountMinor: number, currencyCode: string): string {
  if (!Number.isInteger(amountMinor)) throw new Error("amountMinor must be an integer");
  const major = amountMinor / 100;
  return `${currencyCode} ${major.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
