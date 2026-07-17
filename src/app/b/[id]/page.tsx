import { fetchBill } from "@/lib/bills/getBill";
import { createClient } from "@/lib/supabase/server";
import PeerBill from "./PeerBill";

/**
 * Peer-facing published-bill view — capability URL, NO login (ADR-0002/0006).
 * Server shell: fetch + owner detection. Live ticking/paid/lock in PeerBill (#9).
 */
export default async function PublishedBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const json = await fetchBill(supabase, id);

  if (!json) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">บิลนี้ยังไม่เปิด หรือไม่มีอยู่</h1>
        <p className="text-sm text-ink-muted">
          ถ้าได้ลิงก์มาจากเพื่อน ลองถามคนเปิดบิลว่ากดเปิดบิล (Publish) แล้วหรือยัง
        </p>
      </main>
    );
  }

  const { data: ownedRow } = await supabase.from("bills").select("id").eq("id", id).maybeSingle();
  const isOwner = ownedRow !== null;

  return <PeerBill billId={id} initial={json} isOwner={isOwner} />;
}
