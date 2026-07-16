import { computeBill } from "@/lib/billing/compute";
import { formatSatang } from "@/lib/billing/money";
import type { BillInput } from "@/lib/billing/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Peer-facing published-bill view — capability URL, NO login (ADR-0002/0006).
 * Read-only in #8; ticking + realtime arrive in #9.
 */

interface GetBillJson {
  bill: {
    restaurant: string;
    eatenAt: string;
    billDiscountPercent: number;
    billDiscountSatang: number;
    serviceChargePercent: number;
    vatPercent: number;
    receiptTotalSatang: number;
    paymentInfo: string;
  };
  items: {
    id: string;
    name: string;
    unitPriceSatang: number;
    qty: number;
    discountPercent: number;
    discountSatang: number;
    position: number;
  }[];
  peers: { id: string; name: string }[];
  ticks: { lineItemId: string; peerId: string }[];
}

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" });

export default async function PublishedBillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_bill", { p_bill_id: id });

  if (!data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-bold">บิลนี้ยังไม่เปิด หรือไม่มีอยู่</h1>
        <p className="text-sm text-ink-muted">
          ถ้าได้ลิงก์มาจากเพื่อน ลองถามคนเปิดบิลว่ากดเปิดบิล (Publish) แล้วหรือยัง
        </p>
      </main>
    );
  }

  const json = data as GetBillJson;
  const tickedByItem = new Map<string, string[]>();
  for (const tick of json.ticks) {
    const list = tickedByItem.get(tick.lineItemId) ?? [];
    list.push(tick.peerId);
    tickedByItem.set(tick.lineItemId, list);
  }
  const input: BillInput = {
    items: [...json.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        unitPriceSatang: item.unitPriceSatang,
        qty: item.qty,
        discountPercent: item.discountPercent,
        discountAmountSatang: item.discountSatang,
        tickedBy: tickedByItem.get(item.id) ?? [],
      })),
    peerIds: json.peers.map((peer) => peer.id),
    billDiscount: {
      percent: json.bill.billDiscountPercent,
      amountSatang: json.bill.billDiscountSatang,
    },
    serviceChargePercent: json.bill.serviceChargePercent,
    vatPercent: json.bill.vatPercent,
  };
  const result = computeBill(input);
  const peerName = new Map(json.peers.map((peer) => [peer.id, peer.name]));
  const itemsSorted = [...json.items].sort((a, b) => a.position - b.position);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4 pb-10">
      <header>
        <h1 className="text-2xl font-bold">{json.bill.restaurant || "บิลมื้อนี้"}</h1>
        <p className="text-sm text-ink-muted">
          {dateFormat.format(new Date(json.bill.eatenAt))}
        </p>
      </header>

      <p className="rounded-xl bg-surface-tint p-3 text-sm text-primary-ink">
        ตอนนี้ดูได้อย่างเดียว — การติ๊กเลือกเมนูเองกำลังมาเร็ว ๆ นี้ (#9)
      </p>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold">รายการ</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {itemsSorted.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {item.name || "ไม่มีชื่อเมนู"}
                {item.qty > 1 && <span className="text-ink-muted"> ×{item.qty}</span>}
                <span className="block text-xs text-ink-muted">
                  {(tickedByItem.get(item.id) ?? [])
                    .map((peerId) => peerName.get(peerId))
                    .filter(Boolean)
                    .join(", ") || "ยังไม่มีคนติ๊ก"}
                </span>
              </span>
              <span className="tabular-nums text-ink-muted">
                {formatSatang(item.unitPriceSatang * item.qty)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold">ยอดต่อคน</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {json.peers.map((peer) => (
            <li key={peer.id} className="flex justify-between tabular-nums">
              <span>{peer.name}</span>
              <span className="font-medium">
                {formatSatang(result.peerTotals[peer.id] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-border pt-2 text-sm font-semibold tabular-nums">
          รวม {formatSatang(result.checksumSatang)}
        </p>
      </section>

      {json.bill.paymentInfo && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 font-semibold">โอนคืนที่</h2>
          <p className="text-sm">{json.bill.paymentInfo}</p>
        </section>
      )}
    </main>
  );
}
