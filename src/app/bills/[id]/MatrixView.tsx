"use client";

import { formatSatang } from "@/lib/billing/money";
import type { BillResult } from "@/lib/billing/types";
import type { LineItemRow, PeerRow, TickRow } from "@/lib/bills/types";
import { receiptStatus, receiptStatusCls } from "./BillEditor";

interface Props {
  items: LineItemRow[];
  peers: PeerRow[];
  ticks: TickRow[];
  result: BillResult;
  receiptTotalSatang: number;
  onToggle: (lineItemId: string, peerId: string) => void;
}

/** Desktop (>=lg): sheet-like matrix — items as rows, peers as columns. */
export default function MatrixView({
  items,
  peers,
  ticks,
  result,
  receiptTotalSatang,
  onToggle,
}: Props) {
  const tickSet = new Set(ticks.map((tick) => `${tick.line_item_id}:${tick.peer_id}`));
  const receipt = receiptStatus(receiptTotalSatang, result.checksumSatang);

  if (items.length === 0 || peers.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface p-4 text-sm text-ink-muted">
        เพิ่มเมนูและคนร่วมบิลก่อน แล้วตารางติ๊กจะขึ้นตรงนี้
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">ใครกินอะไร</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-surface p-2 text-left font-semibold">
                เมนู
              </th>
              <th className="p-2 text-right font-semibold">฿</th>
              {peers.map((peer) => (
                <th key={peer.id} className="min-w-14 p-2 text-center font-semibold">
                  {peer.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const unticked = result.untickedItemIds.includes(item.id);
              return (
                <tr key={item.id} className="border-b border-border/60">
                  <td className="sticky left-0 z-10 bg-surface p-2 whitespace-nowrap">
                    {item.name || "ยังไม่มีชื่อเมนู"}
                    {item.discount_percent > 0 && (
                      <span className="ml-1 text-xs text-ink-muted">
                        −{item.discount_percent}%
                      </span>
                    )}
                    {unticked && (
                      <span className="ml-1 text-xs font-medium text-danger">
                        ยังไม่มีใครติ๊ก!
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums text-ink-muted">
                    {formatSatang(item.unit_price_satang * item.qty)}
                  </td>
                  {peers.map((peer) => {
                    const ticked = tickSet.has(`${item.id}:${peer.id}`);
                    return (
                      <td key={peer.id} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => onToggle(item.id, peer.id)}
                          aria-label={`${peer.name} ${ticked ? "ยกเลิก" : "ติ๊ก"} ${item.name}`}
                          aria-pressed={ticked}
                          className={`h-11 w-12 rounded-lg font-bold transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink ${
                            ticked
                              ? "bg-primary text-white hover:bg-primary-deep"
                              : "bg-surface-tint text-ink-muted/50 hover:bg-border"
                          }`}
                        >
                          {ticked ? "✓" : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink/20 font-semibold">
              <td className="sticky left-0 z-10 bg-surface p-2">รวมต่อคน</td>
              <td className="p-2 text-right tabular-nums">
                {formatSatang(result.checksumSatang)}
              </td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center text-xs tabular-nums">
                  {formatSatang(result.peerTotals[peer.id] ?? 0)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
        <span className={`font-bold ${receiptStatusCls(receipt.state)}`}>
          {receipt.label}
        </span>
        {result.surplusSatang !== 0 && result.untickedItemIds.length === 0 && (
          <span className="text-ink-muted tabular-nums">
            ส่วนต่างปัดเศษ {formatSatang(Math.abs(result.surplusSatang))}
          </span>
        )}
      </div>
    </section>
  );
}
