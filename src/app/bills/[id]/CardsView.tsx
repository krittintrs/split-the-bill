"use client";

import { useState } from "react";
import { formatSatang } from "@/lib/billing/money";
import type { BillResult } from "@/lib/billing/types";
import type { LineItemRow, PeerRow, TickRow } from "@/lib/bills/types";
import { receiptStatus } from "./BillEditor";

interface Props {
  items: LineItemRow[];
  peers: PeerRow[];
  ticks: TickRow[];
  result: BillResult;
  receiptTotalSatang: number;
  onToggle: (lineItemId: string, peerId: string) => void;
}

/** Mobile (<lg): stacked item cards + sticky expandable totals bar. */
export default function CardsView({
  items,
  peers,
  ticks,
  result,
  receiptTotalSatang,
  onToggle,
}: Props) {
  const [totalsOpen, setTotalsOpen] = useState(false);
  const tickSet = new Set(ticks.map((tick) => `${tick.line_item_id}:${tick.peer_id}`));
  const receipt = receiptStatus(receiptTotalSatang, result.checksumSatang);

  if (items.length === 0 || peers.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
        เพิ่มเมนูและคนร่วมบิลก่อน แล้วการ์ดติ๊กจะขึ้นตรงนี้
      </section>
    );
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">ใครกินอะไร</h2>
        {items.map((item) => {
          const unticked = result.untickedItemIds.includes(item.id);
          const tickerCount = peers.filter((peer) =>
            tickSet.has(`${item.id}:${peer.id}`),
          ).length;
          const firstTicker = peers.find((peer) => tickSet.has(`${item.id}:${peer.id}`));
          const share =
            firstTicker !== undefined
              ? result.itemSplits[item.id]?.[firstTicker.id]
              : undefined;
          return (
            <div
              key={item.id}
              className={`rounded-xl border bg-surface p-3 ${
                unticked ? "border-danger" : "border-border"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {item.name || "ยังไม่มีชื่อเมนู"}
                  {item.discount_percent > 0 && (
                    <span className="ml-1 text-xs text-ink-muted">
                      −{item.discount_percent}%
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-ink-muted">
                  {formatSatang(item.unit_price_satang * item.qty)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {peers.map((peer) => {
                  const ticked = tickSet.has(`${item.id}:${peer.id}`);
                  return (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => onToggle(item.id, peer.id)}
                      aria-pressed={ticked}
                      className={`min-h-11 rounded-full px-4 py-2 text-sm transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink ${
                        ticked
                          ? "bg-primary font-bold text-white hover:bg-primary-deep"
                          : "bg-surface-tint font-medium text-primary-ink hover:bg-border"
                      }`}
                    >
                      {peer.name}
                    </button>
                  );
                })}
              </div>
              {unticked ? (
                <p className="mt-2 text-xs font-medium text-danger">ยังไม่มีใครติ๊กเมนูนี้</p>
              ) : (
                share !== undefined && (
                  <p className="mt-2 text-xs tabular-nums text-ink-muted">
                    ÷ {tickerCount} = {formatSatang(share)} ต่อคน
                  </p>
                )
              )}
            </div>
          );
        })}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        <button
          type="button"
          onClick={() => setTotalsOpen((open) => !open)}
          aria-expanded={totalsOpen}
          className="flex min-h-14 w-full items-center justify-between px-4 py-3 transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ink"
        >
          <span className="font-semibold tabular-nums">
            Checksum {formatSatang(result.checksumSatang)}
          </span>
          <span
            className={`text-sm font-bold ${receipt.matches ? "text-success" : "text-danger"}`}
          >
            {receipt.label} {totalsOpen ? "▾" : "▴"}
          </span>
        </button>
        {totalsOpen && (
          <div className="max-h-[45dvh] overflow-y-auto border-t border-border px-4 py-3">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {peers.map((peer) => (
                <li key={peer.id} className="flex justify-between tabular-nums">
                  <span>{peer.name}</span>
                  <span>{formatSatang(result.peerTotals[peer.id] ?? 0)}</span>
                </li>
              ))}
            </ul>
            {result.surplusSatang !== 0 && result.untickedItemIds.length === 0 && (
              <p className="mt-2 text-xs tabular-nums text-ink-muted">
                ส่วนต่างปัดเศษ {formatSatang(Math.abs(result.surplusSatang))}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
