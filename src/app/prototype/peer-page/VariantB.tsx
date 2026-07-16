// PROTOTYPE — Variant B "Matrix": spreadsheet grid, items × peers,
// tap cells to tick. Totals + paid as footer rows. Horizontal scroll
// with sticky first column on narrow screens.
"use client";

import { formatSatang } from "@/lib/billing/money";
import { itemTotalSatang, splitSatang, type VariantProps } from "./shared";

export default function VariantB({
  items,
  peers,
  result,
  paid,
  locked,
  onTick,
  onPaid,
}: VariantProps) {
  return (
    <section className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 bg-surface p-3 text-left font-semibold">
              รายการ
            </th>
            {peers.map((peer) => (
              <th key={peer.id} className="p-2 text-center font-semibold">
                {peer.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const split = splitSatang(item);
            return (
              <tr key={item.id} className="border-b border-border">
                <td className="sticky left-0 bg-surface p-3">
                  <span className="block font-medium">{item.name}</span>
                  <span className="block text-xs tabular-nums text-ink-muted">
                    {formatSatang(itemTotalSatang(item))}
                    {split !== null &&
                      ` · ${formatSatang(split)}/คน`}
                  </span>
                </td>
                {peers.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  return (
                    <td key={peer.id} className="p-1 text-center">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onTick(item.id, peer.id)}
                        aria-label={`${peer.name} — ${item.name}`}
                        className={`h-10 w-10 rounded-lg text-lg font-bold transition-colors disabled:opacity-50 ${
                          ticked
                            ? "bg-primary text-white"
                            : "bg-surface-tint text-transparent"
                        }`}
                      >
                        ✓
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-b border-border">
            <td className="sticky left-0 bg-surface p-3 font-semibold">ยอดต่อคน</td>
            {peers.map((peer) => (
              <td key={peer.id} className="p-2 text-center font-semibold tabular-nums">
                {formatSatang(result.peerTotals[peer.id] ?? 0)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="sticky left-0 bg-surface p-3 font-semibold">จ่ายแล้ว</td>
            {peers.map((peer) => (
              <td key={peer.id} className="p-1 text-center">
                <button
                  type="button"
                  onClick={() => onPaid(peer.id)}
                  aria-label={`${peer.name} จ่ายแล้ว`}
                  className={`h-10 w-10 rounded-lg text-lg font-bold ${
                    paid[peer.id]
                      ? "bg-success text-white"
                      : "bg-surface-tint text-transparent"
                  }`}
                >
                  ✓
                </button>
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
