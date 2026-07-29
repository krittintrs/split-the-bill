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
   * addedAt is optional on purpose: fetchBill casts the RPC payload unchecked,
   * so a deploy that lands before the ordering migration would otherwise crash
   * the anon peer view during SSR. Missing values fall back to the id tiebreak.
   */
  peers: { id: string; name: string; paidAt: string | null; addedAt?: string }[];
  ticks: { lineItemId: string; peerId: string }[];
}

export async function fetchBill(
  client: SupabaseClient,
  billId: string,
): Promise<GetBillJson | null> {
  const { data } = await client.rpc("get_bill", { p_bill_id: billId });
  return (data as GetBillJson | null) ?? null;
}
