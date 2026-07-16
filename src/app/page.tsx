import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInWithGoogle } from "@/app/auth/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Split the Bill</h1>
      <p className="text-center text-ink-muted">แชร์ค่าข้าวกับเพื่อน จ่ายคืนไว ไม่มีลืม</p>
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="rounded-full bg-primary px-6 py-3 font-bold text-white hover:bg-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
