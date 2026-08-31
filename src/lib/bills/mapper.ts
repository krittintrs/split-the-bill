import type { BillInput } from "../billing/types";
import type { BillRow, LineItemRow, PeerRow, TickRow } from "./types";

/** DB rows → the billing engine's input. Pure; the only bridge between the two shapes. */
export function mapToBillInput(
  bill: BillRow,
  items: LineItemRow[],
  peers: PeerRow[],
  ticks: TickRow[],
  selfPeerId: string | null,
): BillInput {
  const tickedByItem = new Map<string, string[]>();
  for (const tick of ticks) {
    const list = tickedByItem.get(tick.line_item_id) ?? [];
    list.push(tick.peer_id);
    tickedByItem.set(tick.line_item_id, list);
  }

  return {
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        unitPriceSatang: item.unit_price_satang,
        qty: item.qty,
        discountPercent: item.discount_percent,
        discountAmountSatang: item.discount_satang,
        tickedBy: tickedByItem.get(item.id) ?? [],
        roundingAbsorberPeerId: item.rounding_absorber_peer_id ?? undefined,
      })),
    peerIds: peers.map((peer) => peer.id),
    billDiscount: {
      percent: bill.bill_discount_percent,
      amountSatang: bill.bill_discount_satang,
    },
    serviceChargePercent: bill.service_charge_percent,
    vatPercent: bill.vat_percent,
    roundingAbsorberPeerId: bill.rounding_absorber_peer_id ?? selfPeerId ?? undefined,
  };
}
