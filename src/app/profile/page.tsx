import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";
import AppBar from "@/components/AppBar";
import type { ProfileRow } from "@/lib/bills/types";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data } = await supabase
    .from("profiles")
    .select("user_id, promptpay_id, bank_name, bank_account, account_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile: ProfileRow = data ?? {
    user_id: user.id,
    promptpay_id: "",
    bank_name: "",
    bank_account: "",
    account_name: "",
  };

  return (
    <>
      <AppBar email={user.email ?? ""} />
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
        <div>
          <h1 className="text-xl font-bold">ช่องทางรับเงิน</h1>
          <p className="mt-1 text-sm text-ink-muted">
            ตั้งค่าครั้งเดียว บิลใหม่จะดึงไปใช้อัตโนมัติ (แก้เป็นรายบิลได้)
          </p>
        </div>
        <ProfileForm profile={profile} />
      </main>
    </>
  );
}
