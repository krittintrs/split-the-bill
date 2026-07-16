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
    .select("payment_info")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("bills")
    .insert({ organizer_id: user.id, payment_info: profile?.payment_info ?? "" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createBill: ${error?.message ?? "no row"}`);

  redirect(`/bills/${data.id}`);
}
