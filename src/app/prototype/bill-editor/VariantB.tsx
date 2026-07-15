// PROTOTYPE — Variant B: stacked item cards. One card per line item with
// peer chips to tick; totals live in a sticky expandable bar at the bottom.
// Mobile-first; desktop just centers the column.
import { useState } from "react";
import { formatSatang } from "@/lib/billing/money";
import { parseThbToSatang, type VariantProps } from "./shared";

export default function VariantB({
  items,
  peers,
  result,
  receiptText,
  onToggle,
  onReceiptChange,
}: VariantProps) {
  const [totalsOpen, setTotalsOpen] = useState(false);
  const receiptSatang = parseThbToSatang(receiptText);
  const matches = receiptSatang !== null && receiptSatang === result.checksumSatang;

  return (
    <main className="mx-auto max-w-xl p-4 pb-52">
      <header className="mb-4">
        <h1 className="text-lg font-bold">Katsu Lunch — 15 Jul</h1>
        <p className="text-sm opacity-60">Draft · tap chips to tick</p>
      </header>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const unticked = result.untickedItemIds.includes(item.id);
          return (
            <section
              key={item.id}
              className={`rounded-xl border p-3 ${
                unticked
                  ? "border-red-400"
                  : "border-black/10 dark:border-white/15"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-medium">{item.name}</span>
                <span className="tabular-nums opacity-70">
                  {formatSatang(item.unitPriceSatang * item.qty)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {peers.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  const share = result.itemSplits[item.id]?.[peer.id];
                  return (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => onToggle(item.id, peer.id)}
                      className={`rounded-full px-3 py-2 text-sm ${
                        ticked
                          ? "bg-emerald-500 font-semibold text-white"
                          : "bg-black/5 dark:bg-white/10"
                      }`}
                    >
                      {peer.name}
                      {ticked && share !== undefined && (
                        <span className="ml-1 text-xs opacity-80">
                          {formatSatang(share)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {unticked && (
                <p className="mt-2 text-xs text-red-500">Nobody ticked this yet</p>
              )}
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-16 border-t border-black/10 bg-background/95 backdrop-blur dark:border-white/15">
        <button
          type="button"
          onClick={() => setTotalsOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="font-semibold">
            Checksum {formatSatang(result.checksumSatang)}
          </span>
          <span className={`text-sm font-bold ${matches ? "text-emerald-600" : "text-red-500"}`}>
            {matches ? "✓ receipt" : "✗ receipt"} {totalsOpen ? "▾" : "▴"}
          </span>
        </button>
        {totalsOpen && (
          <div className="border-t border-black/10 px-4 py-3 dark:border-white/15">
            <ul className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {peers.map((peer) => (
                <li key={peer.id} className="flex justify-between tabular-nums">
                  <span>{peer.name}</span>
                  <span>{formatSatang(result.peerTotals[peer.id])}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="receipt-b" className="font-medium">
                Receipt total
              </label>
              <input
                id="receipt-b"
                value={receiptText}
                onChange={(e) => onReceiptChange(e.target.value)}
                inputMode="decimal"
                className="w-28 rounded border border-black/20 bg-transparent p-2 text-right tabular-nums dark:border-white/25"
              />
              <span className={matches ? "text-emerald-600" : "text-red-500"}>
                {matches ? "✓" : "✗"}
              </span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
