import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  BillRow,
  LineItemRow,
  PeerRow,
  ProfileRow,
  TickRow,
} from "@/lib/bills/types";
import BillEditor from "./BillEditor";
import AppBar from "@/components/AppBar";

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // RLS scopes every query to the signed-in organizer; a foreign id reads as missing.
  const { data: bill } = await supabase
    .from("bills")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!bill) notFound();

  const [itemsRes, billPeersRes, recentRes, profileRes] = await Promise.all([
    supabase.from("line_items").select("*").eq("bill_id", id).order("position"),
    // peers (*) and select("*") rather than column lists: PostgREST fails the
    // WHOLE query on an unknown column, so naming linked_user_id or display_name
    // here would empty this bill's peer list and blank its payment fields in the
    // window between deploy and migration. With "*" a missing column is just a
    // missing field, and selfPeerId falls to null.
    supabase
      .from("bill_peers")
      .select("added_at, peers (*)")
      .eq("bill_id", id)
      .order("added_at"),
    supabase
      .from("peers")
      .select("*")
      .order("last_used_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const profile: ProfileRow = profileRes.data ?? {
    user_id: user.id,
    display_name: "",
    promptpay_id: "",
    bank_name: "",
    bank_account: "",
    account_name: "",
  };

  const items = (itemsRes.data ?? []) as LineItemRow[];
  const peersOnBill = (billPeersRes.data ?? [])
    .map((row) => row.peers as unknown as PeerRow)
    .filter(Boolean);

  const recentPeers = (recentRes.data ?? []) as PeerRow[];

  // ADR-0010: the organizer's own row, identified by the joinable predicate
  // linked_user_id = organizer_id, never by comparing names (ADR-0005). The
  // recent list is searched too, so the คุณ badge still resolves on a bill the
  // organizer removed themselves from and re-added from the ล่าสุด chips.
  const selfPeerId =
    [...peersOnBill, ...recentPeers].find((peer) => peer.linked_user_id === user.id)?.id ?? null;

  const itemIds = items.map((item) => item.id);
  const ticks: TickRow[] =
    itemIds.length === 0
      ? []
      : ((
          await supabase
            .from("ticks")
            .select("line_item_id, peer_id")
            .in("line_item_id", itemIds)
        ).data ?? []);

  return (
    <>
      <AppBar email={user.email ?? ""} />
      <BillEditor
        initialBill={bill as BillRow}
        initialItems={items}
        initialPeers={peersOnBill}
        initialTicks={ticks}
        recentPeers={recentPeers}
        selfPeerId={selfPeerId}
        profile={profile}
      />
    </>
  );
}
