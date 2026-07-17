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
    paymentInfo: string;
    paymentMethod: string;
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
  peers: { id: string; name: string; paidAt: string | null }[];
  ticks: { lineItemId: string; peerId: string }[];
}

export async function fetchBill(
  client: SupabaseClient,
  billId: string,
): Promise<GetBillJson | null> {
  const { data } = await client.rpc("get_bill", { p_bill_id: billId });
  return (data as GetBillJson | null) ?? null;
}
