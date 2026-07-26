import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBill } from "./actions";
import CreateBillButton from "./CreateBillButton";
import BillList from "./BillList";
import AppBar from "@/components/AppBar";
import type { BillRow } from "@/lib/bills/types";

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
    <>
      <AppBar email={user.email ?? ""} />
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">บิลของฉัน</h2>
          <form action={createBill}>
            <CreateBillButton />
          </form>
        </div>

        <BillList initialBills={bills} />
      </main>
    </>
  );
}
