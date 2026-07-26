import { createClient } from "@/lib/supabase/client";
import type { BillRow, LineItemRow, PeerRow } from "./types";

/**
 * All organizer writes (browser, RLS-scoped). One function per user action —
 * autosave calls these directly (ADR-0005); throw on any Supabase error.
 */

type BillPatch = Partial<
  Pick<
    BillRow,
    | "restaurant"
    | "eaten_at"
    | "bill_discount_percent"
    | "bill_discount_satang"
    | "service_charge_percent"
    | "vat_percent"
    | "receipt_total_satang"
    | "promptpay_id"
    | "bank_name"
    | "bank_account"
    | "account_name"
  >
>;

type LineItemPatch = Partial<
  Pick<
    LineItemRow,
    "name" | "unit_price_satang" | "qty" | "discount_percent" | "discount_satang"
  >
>;

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

export async function updateBill(billId: string, patch: BillPatch): Promise<void> {
  const { error } = await createClient().from("bills").update(patch).eq("id", billId);
  if (error) fail("updateBill", error);
}

export async function setBillStatus(
  billId: string,
  status: "open" | "locked",
): Promise<void> {
  const { error } = await createClient().from("bills").update({ status }).eq("id", billId);
  if (error) fail("setBillStatus", error);
}

export async function publishBill(billId: string): Promise<void> {
  return setBillStatus(billId, "open");
}

/**
 * Hard delete a bill; DB cascade removes its line_items/bill_peers/ticks.
 * Guarded server-side against deleting a locked (settled) bill — the UI
 * hides the delete action for locked bills, but this guard is the one that
 * actually enforces it, since RLS alone would allow it.
 */
export async function deleteBill(billId: string): Promise<void> {
  const { data, error } = await createClient()
    .from("bills")
    .delete()
    .eq("id", billId)
    .neq("status", "locked")
    .select("id");
  if (error) fail("deleteBill", error);
  if (!data || data.length === 0) {
    throw new Error("deleteBill: bill is locked and can no longer be deleted");
  }
}

export async function addLineItem(billId: string, position: number): Promise<LineItemRow> {
  const { data, error } = await createClient()
    .from("line_items")
    .insert({ bill_id: billId, position })
    .select()
    .single();
  if (error || !data) fail("addLineItem", error);
  return data as LineItemRow;
}

export async function updateLineItem(itemId: string, patch: LineItemPatch): Promise<void> {
  const { error } = await createClient().from("line_items").update(patch).eq("id", itemId);
  if (error) fail("updateLineItem", error);
}

export async function deleteLineItem(itemId: string): Promise<void> {
  const { error } = await createClient().from("line_items").delete().eq("id", itemId);
  if (error) fail("deleteLineItem", error);
}

export async function listRecentPeers(): Promise<PeerRow[]> {
  const { data, error } = await createClient()
    .from("peers")
    .select("id, name, last_used_at")
    .order("last_used_at", { ascending: false })
    .limit(20);
  if (error) fail("listRecentPeers", error);
  return (data ?? []) as PeerRow[];
}

/** Upsert the contact (touch last_used_at), then attach it to the bill. */
export async function addPeerToBill(billId: string, name: string): Promise<PeerRow> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("addPeerToBill: not signed in");

  const { data: peer, error: peerError } = await supabase
    .from("peers")
    .upsert(
      { organizer_id: user.id, name: name.trim(), last_used_at: new Date().toISOString() },
      { onConflict: "organizer_id,name" },
    )
    .select("id, name, last_used_at")
    .single();
  if (peerError || !peer) fail("addPeerToBill (peer)", peerError);

  const { error: linkError } = await supabase
    .from("bill_peers")
    .upsert({ bill_id: billId, peer_id: peer.id });
  if (linkError) fail("addPeerToBill (link)", linkError);
  return peer as PeerRow;
}

/** Detach from the bill and clear that peer's ticks on this bill's items. */
export async function removePeerFromBill(
  billId: string,
  peerId: string,
  lineItemIds: string[],
): Promise<void> {
  const supabase = createClient();
  if (lineItemIds.length > 0) {
    const { error } = await supabase
      .from("ticks")
      .delete()
      .eq("peer_id", peerId)
      .in("line_item_id", lineItemIds);
    if (error) fail("removePeerFromBill (ticks)", error);
  }
  const { error } = await supabase
    .from("bill_peers")
    .delete()
    .eq("bill_id", billId)
    .eq("peer_id", peerId);
  if (error) fail("removePeerFromBill", error);
}

export async function toggleTick(
  lineItemId: string,
  peerId: string,
  ticked: boolean,
): Promise<void> {
  const supabase = createClient();
  if (ticked) {
    const { error } = await supabase
      .from("ticks")
      .upsert({ line_item_id: lineItemId, peer_id: peerId });
    if (error) fail("toggleTick (tick)", error);
  } else {
    const { error } = await supabase
      .from("ticks")
      .delete()
      .eq("line_item_id", lineItemId)
      .eq("peer_id", peerId);
    if (error) fail("toggleTick (untick)", error);
  }
}
