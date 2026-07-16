// PROTOTYPE — Variant A "Receipt": single column, items with tick chips
// inline (same grammar as #8 cards view), everyone section below.
"use client";

import { formatSatang } from "@/lib/billing/money";
import { itemTotalSatang, splitSatang, type VariantProps } from "./shared";

export default function VariantA({
  items,
  peers,
  result,
  paid,
  locked,
  onTick,
  onPaid,
}: VariantProps) {
  const peerName = new Map(peers.map((p) => [p.id, p.name]));

  return (
    <>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold">รายการ — ติ๊กที่เรากิน</h2>
        <ul className="flex flex-col gap-4">
          {items.map((item) => {
            const split = splitSatang(item);
            return (
              <li key={item.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{item.name}</span>
                  <span className="tabular-nums text-ink-muted">
                    {formatSatang(itemTotalSatang(item))}
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  {split === null
                    ? "ยังไม่มีคนติ๊ก"
                    : `${formatSatang(split)} / คน × ${item.tickedBy.length}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {peers.map((peer) => {
                    const ticked = item.tickedBy.includes(peer.id);
                    return (
                      <button
                        key={peer.id}
                        type="button"
                        disabled={locked}
                        onClick={() => onTick(item.id, peer.id)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                          ticked
                            ? "bg-primary text-white"
                            : "bg-surface-tint text-ink"
                        }`}
                      >
                        {ticked ? "✓ " : ""}
                        {peer.name}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold">ทุกคน</h2>
        <ul className="flex flex-col divide-y divide-border">
          {peers.map((peer) => (
            <li key={peer.id} className="flex items-center justify-between gap-3 py-2">
              <span className={paid[peer.id] ? "text-ink-muted" : ""}>
                {peerName.get(peer.id)}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">
                  {formatSatang(result.peerTotals[peer.id] ?? 0)}
                </span>
                <button
                  type="button"
                  onClick={() => onPaid(peer.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    paid[peer.id]
                      ? "bg-success text-white"
                      : "border border-border text-ink-muted"
                  }`}
                >
                  {paid[peer.id] ? "✓ จ่ายแล้ว" : "ยังไม่จ่าย"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
