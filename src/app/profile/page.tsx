import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";
import AppBar from "@/components/AppBar";
import type { ProfileRow } from "@/lib/bills/types";
import { resolveDisplayName } from "@/lib/bills/displayName";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // select("*"), not a column list: PostgREST fails the whole query on an
  // unknown column, so naming display_name would blank the payment fields in
  // the window between deploy and migration.
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile: ProfileRow = {
    user_id: user.id,
    // ADR-0010: never blank — this names the organizer's column on every bill.
    display_name: resolveDisplayName(data?.display_name, {
      fullName: user.user_metadata?.full_name,
      name: user.user_metadata?.name,
      email: user.email,
    }),
    promptpay_id: data?.promptpay_id ?? "",
    bank_name: data?.bank_name ?? "",
    bank_account: data?.bank_account ?? "",
    account_name: data?.account_name ?? "",
  };

  return (
    <>
      <AppBar email={user.email ?? ""} />
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
        <h1 className="text-xl font-bold">โปรไฟล์</h1>
        <ProfileForm profile={profile} />
      </main>
    </>
  );
}
