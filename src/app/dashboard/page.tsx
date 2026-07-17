import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { createBill } from "./actions";
import CreateBillButton from "./CreateBillButton";
import type { BillRow } from "@/lib/bills/types";

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data } = await supabase
    .from("bills")
    .select("id, restaurant, eaten_at, status")
    .order("created_at", { ascending: false });
  const bills = (data ?? []) as Pick<BillRow, "id" | "restaurant" | "eaten_at" | "status">[];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Split the Bill</h1>
        <div className="flex items-baseline gap-3 text-sm text-ink-muted">
          {user.email}
          <form action={signOut}>
            <button type="submit" className="text-primary-ink underline">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">บิลของฉัน</h2>
        <form action={createBill}>
          <CreateBillButton />
        </form>
      </div>

      {bills.length === 0 ? (
        <p className="mt-8 text-center text-ink-muted">
          ยังไม่มีบิล — สร้างบิลแรกของคุณด้วยปุ่มด้านบน
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bills.map((bill) => (
            <li key={bill.id}>
              <Link
                href={`/bills/${bill.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary-ink"
              >
                <span className="font-medium">
                  {bill.restaurant || "ยังไม่มีชื่อร้าน"}
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-ink-muted">
                    {dateFormat.format(new Date(bill.eaten_at))}
                  </span>
                  {bill.status === "open" ? (
                    <span className="rounded-full bg-success px-3 py-1 text-sm font-bold text-white">
                      เปิดแล้ว
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-tint px-3 py-1 text-sm font-medium text-primary-ink">
                      ฉบับร่าง
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
