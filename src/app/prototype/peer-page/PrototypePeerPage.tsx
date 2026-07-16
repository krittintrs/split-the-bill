// PROTOTYPE — throwaway container for the #9 peer page layout question.
// Owns fake state (ticks, paid, lock, role); variants only render.
"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { computeBill } from "@/lib/billing/compute";
import { formatSatang } from "@/lib/billing/money";
import PrototypeSwitcher from "./PrototypeSwitcher";
import { INITIAL_ITEMS, PEERS, type PeerPageItem } from "./shared";
import VariantA from "./VariantA";
import VariantB from "./VariantB";
import VariantC from "./VariantC";

const VARIANTS = [
  { key: "A", name: "Receipt" },
  { key: "B", name: "Matrix" },
  { key: "C", name: "People-first" },
];

export default function PrototypePeerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const variant = searchParams.get("v") ?? "A";

  const [items, setItems] = useState<PeerPageItem[]>(INITIAL_ITEMS);
  const [paid, setPaid] = useState<Record<string, boolean>>({ d: true });
  const [locked, setLocked] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const result = useMemo(
    () =>
      computeBill({
        items,
        peerIds: PEERS.map((p) => p.id),
        billDiscount: { percent: 0, amountSatang: 0 },
        serviceChargePercent: 10,
        vatPercent: 7,
      }),
    [items],
  );

  function onTick(itemId: string, peerId: string) {
    if (locked) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              tickedBy: item.tickedBy.includes(peerId)
                ? item.tickedBy.filter((id) => id !== peerId)
                : [...item.tickedBy, peerId],
            }
          : item,
      ),
    );
  }

  function onPaid(peerId: string) {
    setPaid((prev) => ({ ...prev, [peerId]: !prev[peerId] }));
  }

  const Variant = variant === "B" ? VariantB : variant === "C" ? VariantC : VariantA;

  return (
    <main className={`mx-auto flex w-full flex-col gap-4 p-4 pb-24 ${variant === "B" ? "max-w-4xl" : "max-w-xl"}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">คัตสึหลังออฟฟิศ</h1>
          <p className="text-sm text-ink-muted">16 กรกฎาคม 2569</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              locked ? "bg-ink text-white" : "bg-surface-tint text-primary-ink"
            }`}
          >
            {locked ? "ล็อกแล้ว" : "เปิดอยู่"}
          </span>
          {isOwner && (
            <button
              type="button"
              onClick={() => setLocked((v) => !v)}
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-deep"
            >
              {locked ? "ปลดล็อกบิล" : "ล็อกบิล"}
            </button>
          )}
        </div>
      </header>

      {locked && (
        <p className="rounded-xl bg-surface-tint p-3 text-sm text-primary-ink">
          บิลถูกล็อกแล้ว ยอดเป็นอันสุดท้าย — ติ๊กรายการไม่ได้ แต่ยังกด &quot;จ่ายแล้ว&quot; ได้
        </p>
      )}

      <Variant
        items={items}
        peers={PEERS}
        result={result}
        paid={paid}
        locked={locked}
        onTick={onTick}
        onPaid={onPaid}
      />

      <p className="text-right text-sm font-semibold tabular-nums">
        รวมทั้งบิล {formatSatang(result.checksumSatang)}
      </p>

      {/* dev-only role toggle, not part of the design being judged */}
      <button
        type="button"
        onClick={() => setIsOwner((v) => !v)}
        className="fixed right-3 top-3 z-50 rounded-full bg-black px-3 py-1 text-xs text-white shadow-lg"
      >
        role: {isOwner ? "owner" : "peer"}
      </button>

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => router.replace(`?v=${key}`, { scroll: false })}
      />
    </main>
  );
}
