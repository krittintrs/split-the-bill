export function formatSatang(satang: number): string {
  if (!Number.isInteger(satang)) throw new Error("satang must be an integer");
  const baht = satang / 100;
  return `฿${baht.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
