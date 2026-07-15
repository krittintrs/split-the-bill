// PROTOTYPE — throwaway. Fixture + shared types for the #8 bill editor
// layout question. All names are fake; numbers follow the canonical Katsu
// fixture (checksum ฿902.70 when fully ticked).
import type { BillResult, LineItemInput } from "@/lib/billing/types";

export interface Peer {
  id: string;
  name: string;
}

export interface EditorItem extends LineItemInput {
  name: string;
}

export interface BillMeta {
  billDiscountPercent: number;
  serviceChargePercent: number;
  vatPercent: number;
}

export interface VariantProps {
  items: EditorItem[];
  peers: Peer[];
  result: BillResult;
  receiptText: string;
  billMeta: BillMeta;
  chipStyle: "name" | "initial";
  showChipAmounts: boolean;
  onToggle: (itemId: string, peerId: string) => void;
  onReceiptChange: (text: string) => void;
  onMetaChange: (meta: BillMeta) => void;
}

export const PEERS_FEW: Peer[] = [
  { id: "a", name: "Amy" },
  { id: "b", name: "Ben" },
  { id: "c", name: "Chai" },
  { id: "d", name: "Dow" },
  { id: "e", name: "Earn" },
];

export const PEERS_MANY: Peer[] = [
  ...PEERS_FEW,
  { id: "f", name: "Fern" },
  { id: "g", name: "Gift" },
  { id: "h", name: "Hana" },
  { id: "i", name: "Ice" },
  { id: "j", name: "Jane" },
  { id: "k", name: "Kim" },
  { id: "l", name: "Ling" },
];

export const INITIAL_ITEMS: EditorItem[] = [
  { id: "i1", name: "Pork katsu set", unitPriceSatang: 15900, qty: 1, discountPercent: 10, tickedBy: ["d"] },
  { id: "i2", name: "Cheesy don", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["a"] },
  { id: "i3", name: "Chicken don", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: ["b"] },
  { id: "i4", name: "Add-on egg", unitPriceSatang: 5900, qty: 1, discountPercent: 10, tickedBy: ["b"] },
  { id: "i5", name: "Add-on cheese", unitPriceSatang: 8900, qty: 1, discountPercent: 10, tickedBy: ["e"] },
  { id: "i6", name: "A la carte loin", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: ["e"] },
  { id: "i7", name: "Chicken katsu set", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["c"] },
];

/** "902.70" or "1,234.5" → satang, or null if not a number. */
export function parseThbToSatang(text: string): number | null {
  const value = Number(text.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || text.trim() === "") return null;
  return Math.round(value * 100);
}
