"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveDisplayName } from "@/lib/bills/displayName";

/** Create a draft bill (payment info defaulted from profile) and open its editor. */
export async function createBill() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // select("*") on purpose, not a column list: PostgREST fails the WHOLE query
  // on an unknown column, so naming display_name here would blank the payment
  // info on every new bill in the window between deploy and migration.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("bills")
    .insert({
      organizer_id: user.id,
      promptpay_id: profile?.promptpay_id ?? "",
      bank_name: profile?.bank_name ?? "",
      bank_account: profile?.bank_account ?? "",
      account_name: profile?.account_name ?? "",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createBill: ${error?.message ?? "no row"}`);

  // ADR-0010: the organizer eats on nearly every bill, so they join it by default
  // and remove themselves on the rare bill they only paid for. One self-peer per
  // organizer, found by linked_user_id and reused across bills.
  //
  // Wrapped: a bill that exists without the organizer on it is recoverable (add
  // yourself from the ล่าสุด chips). A create button that throws is not.
  try {
    const displayName = resolveDisplayName(profile?.display_name, {
      fullName: user.user_metadata?.full_name,
      name: user.user_metadata?.name,
      email: user.email,
    });

    const { data: existing } = await supabase
      .from("peers")
      .select("id")
      .eq("organizer_id", user.id)
      .eq("linked_user_id", user.id)
      .maybeSingle();

    let selfPeerId: string | null = existing?.id ?? null;

    if (!selfPeerId) {
      const inserted = await supabase
        .from("peers")
        .insert({ organizer_id: user.id, name: displayName, linked_user_id: user.id })
        .select("id")
        .single();
      if (inserted.data) {
        selfPeerId = inserted.data.id;
      } else {
        // Deliberately NOT adopting the colliding row. A peer already carrying
        // this name is indistinguishable from a friend of the same name, and
        // marking a friend as the organizer is unrecoverable: they lose their QR
        // and the next display-name edit renames them on every past bill.
        // Leaving the organizer off this bill costs one tap on the ล่าสุด chips.
        console.error("createBill: self-peer not created", inserted.error?.message);
      }
    }

    if (selfPeerId) {
      await supabase.from("bill_peers").insert({ bill_id: data.id, peer_id: selfPeerId });
    }
  } catch (err) {
    // Bill is created either way; the organizer can add themselves manually.
    // Logged because a silently failing self-peer path would be invisible in prod.
    console.error("createBill: self-peer step failed", err);
  }

  redirect(`/bills/${data.id}`);
}
