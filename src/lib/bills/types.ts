/** DB row shapes — mirror supabase/migrations/ exactly. */
export interface BillRow {
  id: string;
  restaurant: string;
  eaten_at: string;
  status: "draft" | "open" | "locked";
  bill_discount_percent: number;
  bill_discount_satang: number;
  service_charge_percent: number;
  vat_percent: number;
  receipt_total_satang: number;
  promptpay_id: string;
  bank_name: string;
  bank_account: string;
  account_name: string;
  /** ADR-0011: peer who absorbs the bill-wide rounding leftover. */
  rounding_absorber_peer_id: string | null;
  /** #38: both-or-neither with fx_rate_numerator/fx_rate_denominator; null = pure THB. */
  purchase_currency: string | null;
  fx_rate_numerator: number | null;
  fx_rate_denominator: number | null;
}

export interface ProfileRow {
  user_id: string;
  display_name: string;
  promptpay_id: string;
  bank_name: string;
  bank_account: string;
  account_name: string;
}

export interface LineItemRow {
  id: string;
  bill_id: string;
  name: string;
  unit_price_satang: number;
  qty: number;
  discount_percent: number;
  discount_satang: number;
  position: number;
}

export interface PeerRow {
  id: string;
  name: string;
  last_used_at?: string;
  /** ADR-0010: set to the organizer's own user id on their self-peer. */
  linked_user_id?: string | null;
}

export interface TickRow {
  line_item_id: string;
  peer_id: string;
}
