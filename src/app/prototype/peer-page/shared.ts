// PROTOTYPE — throwaway. Fixture + shared types for the #9 peer page
// layout question. Fake names, Katsu-style numbers. Never merge to main.
import type { BillResult, LineItemInput } from "@/lib/billing/types";

export interface Peer {
  id: string;
  name: string;
}

export interface PeerPageItem extends LineItemInput {
  name: string;
}

export interface VariantProps {
  items: PeerPageItem[];
  peers: Peer[];
  result: BillResult;
  paid: Record<string, boolean>;
  locked: boolean;
  onTick: (itemId: string, peerId: string) => void;
  onPaid: (peerId: string) => void;
}

export const PEERS: Peer[] = [
  { id: "a", name: "Amy" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Chai" },
  { id: "d", name: "Dow" },
  { id: "e", name: "Earn" },
];

export const INITIAL_ITEMS: PeerPageItem[] = [
  { id: "i1", name: "Pork katsu set", unitPriceSatang: 15900, qty: 1, discountPercent: 10, tickedBy: ["d"] },
  { id: "i2", name: "Cheesy don", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["a"] },
  { id: "i3", name: "Chicken don", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: ["b"] },
  { id: "i4", name: "Add-on egg", unitPriceSatang: 5900, qty: 1, discountPercent: 10, tickedBy: ["b", "d"] },
  { id: "i5", name: "Add-on cheese", unitPriceSatang: 8900, qty: 1, discountPercent: 10, tickedBy: ["e"] },
  { id: "i6", name: "A la carte loin", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: [] },
  { id: "i7", name: "Chicken katsu set", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["c"] },
];

/** Display-only: item line total after its own discount. */
export function itemTotalSatang(item: PeerPageItem): number {
  const gross = item.unitPriceSatang * item.qty;
  const afterPercent = Math.round(gross * (1 - (item.discountPercent ?? 0) / 100));
  return afterPercent - (item.discountAmountSatang ?? 0);
}

/** Display-only per-ticker split, null when nobody ticked. */
export function splitSatang(item: PeerPageItem): number | null {
  const n = item.tickedBy.length;
  return n === 0 ? null : Math.ceil(itemTotalSatang(item) / n);
}
