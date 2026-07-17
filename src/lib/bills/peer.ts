import { createClient } from "@/lib/supabase/client";

export async function setTick(
  billId: string,
  lineItemId: string,
  peerId: string,
  on: boolean,
): Promise<void> {
  const { error } = await createClient().rpc("set_tick", {
    p_bill_id: billId,
    p_line_item_id: lineItemId,
    p_peer_id: peerId,
    p_on: on,
  });
  if (error) throw new Error(`setTick: ${error.message}`);
}

export async function setPaid(billId: string, peerId: string, paid: boolean): Promise<void> {
  const { error } = await createClient().rpc("set_paid", {
    p_bill_id: billId,
    p_peer_id: peerId,
    p_paid: paid,
  });
  if (error) throw new Error(`setPaid: ${error.message}`);
}

/** ADR-0007: subscribe to the bill's ping channel; returns unsubscribe. */
export function subscribeBillChanged(billId: string, onPing: () => void): () => void {
  const client = createClient();
  const channel = client
    .channel(`bill:${billId}`)
    .on("broadcast", { event: "changed" }, onPing)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
