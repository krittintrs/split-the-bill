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
    supabase.from("bill_peers").select("added_at, peers (id, name)").eq("bill_id", id).order("added_at"),
    supabase
      .from("peers")
      .select("id, name, last_used_at")
      .order("last_used_at", { ascending: false })
      .limit(20),
    supabase
      .from("profiles")
      .select("user_id, display_name, promptpay_id, bank_name, bank_account, account_name")
      .eq("user_id", user.id)
      .maybeSingle(),
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
        recentPeers={(recentRes.data ?? []) as PeerRow[]}
        profile={profile}
      />
    </>
  );
}
