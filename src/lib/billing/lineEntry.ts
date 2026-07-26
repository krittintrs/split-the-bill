/**
 * The two directions of line-item price entry (#25).
 *
 * `unit_price_satang` is what the bill stores and what computeBill multiplies
 * out, so the line total is always the derived side. Plenty of receipts print
 * only the line total though (Oyster Bay: "pad kra pao 429.12 x4"), so the
 * editor keeps both boxes live and derives whichever one you are not typing in.
 */
import { ceilToSatang, fraction } from "./fraction";

function assertSatang(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label} must be integer satang`);
  if (value < 0) throw new Error(`${label} must not be negative`);
}

function assertQty(qty: number): void {
  if (!Number.isInteger(qty) || qty < 1) throw new Error("qty must be an integer >= 1");
}

/** Gross line total, before the item's own discounts. Exact: no rounding needed. */
export function totalFromUnitPriceSatang(unitPriceSatang: number, qty: number): number {
  assertSatang(unitPriceSatang, "unitPriceSatang");
  assertQty(qty);
  return unitPriceSatang * qty;
}

/**
 * Back-calculate the stored unit price from a typed line total.
 *
 * Rounds UP via the engine's one rounding operation (ADR-0001), so a total that
 * does not divide evenly leaves the organizer whole rather than short: ฿100.00
 * across 3 settles to ฿33.34 each, a ฿100.02 line. The editor re-derives and
 * shows that settled total, so the adjustment is never silent.
 */
export function unitPriceFromTotalSatang(totalSatang: number, qty: number): number {
  assertSatang(totalSatang, "totalSatang");
  assertQty(qty);
  return ceilToSatang(fraction(BigInt(totalSatang), BigInt(qty)));
}
