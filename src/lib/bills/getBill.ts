import type { SupabaseClient } from "@supabase/supabase-js";

export interface GetBillJson {
  bill: {
    restaurant: string;
    eatenAt: string;
    status: "open" | "locked";
    billDiscountPercent: number;
    billDiscountSatang: number;
    serviceChargePercent: number;
    vatPercent: number;
    receiptTotalSatang: number;
    promptpayId: string;
    bankName: string;
    bankAccount: string;
    accountName: string;
    /**
     * ADR-0011. Optional for the same deploy-before-migration reason as peers'
     * addedAt/isSelf below: a deploy landing before its migration must degrade,
     * not crash, so the field is typed optional even though the column is non-nullable-by-default.
     */
    roundingAbsorberPeerId?: string | null;
  };
  items: {
    id: string;
    name: string;
    unitPriceSatang: number;
    qty: number;
    discountPercent: number;
    discountSatang: number;
    position: number;
  }[];
  /**
   * Server-ordered by (addedAt, id); re-sort on the same key before rendering.
   * addedAt and isSelf are optional on purpose: fetchBill casts the RPC payload
   * unchecked, so a deploy that lands before the migration would otherwise crash
   * the anon peer view during SSR. Missing addedAt falls back to the id tiebreak;
   * missing isSelf degrades the organizer's row to an ordinary peer.
   */
  peers: {
    id: string;
    name: string;
    paidAt: string | null;
    addedAt?: string;
    isSelf?: boolean;
  }[];
  ticks: { lineItemId: string; peerId: string }[];
}

export async function fetchBill(
  client: SupabaseClient,
  billId: string,
): Promise<GetBillJson | null> {
  const { data } = await client.rpc("get_bill", { p_bill_id: billId });
  return (data as GetBillJson | null) ?? null;
}
