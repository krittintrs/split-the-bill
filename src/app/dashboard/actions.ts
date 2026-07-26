"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Create a draft bill (payment info defaulted from profile) and open its editor. */
export async function createBill() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("promptpay_id, bank_name, bank_account, account_name")
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

  redirect(`/bills/${data.id}`);
}
