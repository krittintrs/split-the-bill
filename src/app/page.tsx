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
      <p className="text-center">แชร์ค่าข้าวกับเพื่อน จ่ายคืนไว ไม่มีลืม</p>
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="rounded-full bg-black px-6 py-3 text-white dark:bg-white dark:text-black"
        >
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
