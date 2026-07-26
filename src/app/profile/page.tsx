import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProfileForm from "./ProfileForm";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">ช่องทางรับเงิน</h1>
        <Link
          href="/dashboard"
          className="text-sm text-primary-ink underline transition hover:text-primary-deep active:scale-95"
        >
          กลับหน้าบิล
        </Link>
      </header>
      <p className="text-sm text-ink-muted">
        ตั้งค่าครั้งเดียว บิลใหม่จะดึงไปใช้อัตโนมัติ (แก้เป็นรายบิลได้)
      </p>
      <ProfileForm profile={profile} />
    </main>
  );
}
