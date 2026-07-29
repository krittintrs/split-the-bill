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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, promptpay_id, bank_name, bank_account, account_name")
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
        // The name is already taken by a peer the organizer made by hand. Adopt
        // that row rather than fail: bill creation must not die on a name clash.
        const adopted = await supabase
          .from("peers")
          .update({ linked_user_id: user.id })
          .eq("organizer_id", user.id)
          .eq("name", displayName)
          .select("id")
          .single();
        selfPeerId = adopted.data?.id ?? null;
      }
    }

    if (selfPeerId) {
      await supabase.from("bill_peers").insert({ bill_id: data.id, peer_id: selfPeerId });
    }
  } catch {
    // Bill is created either way; the organizer can add themselves manually.
  }

  redirect(`/bills/${data.id}`);
}
