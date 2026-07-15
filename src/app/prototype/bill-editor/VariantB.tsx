// PROTOTYPE — Variant B: stacked item cards. One card per line item with
// peer chips to tick; totals live in a sticky expandable bar at the bottom.
// Chip style (full name vs initial circle) and ฿-in-chip come from the
// prototype settings pill.
import { useState } from "react";
import { formatSatang } from "@/lib/billing/money";
import { parseThbToSatang, type VariantProps } from "./shared";
import BillMetaFields from "./BillMetaFields";

export default function VariantB({
  items,
  peers,
  result,
  receiptText,
  billMeta,
  chipStyle,
  showChipAmounts,
  onToggle,
  onReceiptChange,
  onMetaChange,
}: VariantProps) {
  const [totalsOpen, setTotalsOpen] = useState(false);
  const receiptSatang = parseThbToSatang(receiptText);
  const matches = receiptSatang !== null && receiptSatang === result.checksumSatang;

  return (
    <main className="mx-auto max-w-xl p-4 pb-64">
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
                unticked ? "border-red-400" : "border-black/10 dark:border-white/15"
              }`}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-medium">
                  {item.name}
                  {item.discountPercent ? (
                    <span className="ml-1 text-xs opacity-50">−{item.discountPercent}%</span>
                  ) : null}
                </span>
                <span className="tabular-nums opacity-70">
                  {formatSatang(item.unitPriceSatang * item.qty)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {peers.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  const share = result.itemSplits[item.id]?.[peer.id];
                  const tickedClasses = "bg-emerald-500 font-semibold text-white";
                  const idleClasses = "bg-black/5 dark:bg-white/10";
                  if (chipStyle === "initial") {
                    return (
                      <button
                        key={peer.id}
                        type="button"
                        title={peer.name}
                        onClick={() => onToggle(item.id, peer.id)}
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm ${
                          ticked ? tickedClasses : idleClasses
                        }`}
                      >
                        {peer.name[0]}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={peer.id}
                      type="button"
                      onClick={() => onToggle(item.id, peer.id)}
                      className={`rounded-full px-3 py-2 text-sm ${
                        ticked ? tickedClasses : idleClasses
                      }`}
                    >
                      {peer.name}
                      {ticked && showChipAmounts && share !== undefined && (
                        <span className="ml-1 text-xs opacity-80">{formatSatang(share)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {unticked ? (
                <p className="mt-2 text-xs text-red-500">Nobody ticked this yet</p>
              ) : (
                !showChipAmounts && (
                  <p className="mt-2 text-xs opacity-60 tabular-nums">
                    ÷ {item.tickedBy.length} ={" "}
                    {formatSatang(result.itemSplits[item.id]?.[item.tickedBy[0]] ?? 0)} each
                  </p>
                )
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
          <span
            className={`text-sm font-bold ${matches ? "text-emerald-600" : "text-red-500"}`}
          >
            {matches ? "✓ receipt" : "✗ receipt"} {totalsOpen ? "▾" : "▴"}
          </span>
        </button>
        {totalsOpen && (
          <div className="max-h-[50dvh] overflow-y-auto border-t border-black/10 px-4 py-3 dark:border-white/15">
            <ul className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {peers.map((peer) => (
                <li key={peer.id} className="flex justify-between tabular-nums">
                  <span>{peer.name}</span>
                  <span>{formatSatang(result.peerTotals[peer.id])}</span>
                </li>
              ))}
            </ul>
            <BillMetaFields
              billMeta={billMeta}
              onMetaChange={onMetaChange}
              receiptText={receiptText}
              onReceiptChange={onReceiptChange}
              checksumSatang={result.checksumSatang}
            />
          </div>
        )}
      </div>
    </main>
  );
}
