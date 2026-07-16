// PROTOTYPE — Variant C "People-first": totals + paid on top (the answer
// peers came for), tick list below in compact form.
"use client";

import { formatSatang } from "@/lib/billing/money";
import { itemTotalSatang, splitSatang, type VariantProps } from "./shared";

export default function VariantC({
  items,
  peers,
  result,
  paid,
  locked,
  onTick,
  onPaid,
}: VariantProps) {
  return (
    <>
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {peers.map((peer) => (
          <div
            key={peer.id}
            className={`flex flex-col gap-1 rounded-xl border p-3 ${
              paid[peer.id]
                ? "border-border bg-surface-tint"
                : "border-border bg-surface"
            }`}
          >
            <span className="text-sm font-medium">{peer.name}</span>
            <span className="text-xl font-bold tabular-nums">
              {formatSatang(result.peerTotals[peer.id] ?? 0)}
            </span>
            <button
              type="button"
              onClick={() => onPaid(peer.id)}
              className={`mt-1 rounded-full px-2 py-1 text-xs font-semibold ${
                paid[peer.id]
                  ? "bg-success text-white"
                  : "border border-border text-ink-muted"
              }`}
            >
              {paid[peer.id] ? "✓ จ่ายแล้ว" : "ยังไม่จ่าย"}
            </button>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold">รายการ — ติ๊กที่เรากิน</h2>
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const split = splitSatang(item);
            return (
              <li key={item.id} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {item.name}
                    <span className="ml-2 text-xs font-normal text-ink-muted">
                      {split === null
                        ? "ยังไม่มีคนติ๊ก"
                        : `${formatSatang(split)}/คน`}
                    </span>
                  </span>
                  <span className="tabular-nums text-ink-muted">
                    {formatSatang(itemTotalSatang(item))}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {peers.map((peer) => {
                    const ticked = item.tickedBy.includes(peer.id);
                    return (
                      <button
                        key={peer.id}
                        type="button"
                        disabled={locked}
                        onClick={() => onTick(item.id, peer.id)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
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
    </>
  );
}
