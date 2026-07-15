// PROTOTYPE — Variant C: split pane. Compact item list on the left with
// tap-to-expand peer pickers; per-peer totals always visible in a desktop
// sidebar, collapsing to a bottom sheet on mobile.
import { useState } from "react";
import { formatSatang } from "@/lib/billing/money";
import { parseThbToSatang, type Peer, type VariantProps } from "./shared";

export default function VariantC({
  items,
  peers,
  result,
  receiptText,
  onToggle,
  onReceiptChange,
}: VariantProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const peerById = new Map(peers.map((peer) => [peer.id, peer]));
  const receiptSatang = parseThbToSatang(receiptText);
  const matches = receiptSatang !== null && receiptSatang === result.checksumSatang;

  const totalsPanel = (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold">Totals</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {peers.map((peer) => (
          <li key={peer.id} className="flex justify-between tabular-nums">
            <span>{peer.name}</span>
            <span>{formatSatang(result.peerTotals[peer.id])}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-black/10 pt-2 font-semibold tabular-nums dark:border-white/15">
        <span>Checksum</span>
        <span>{formatSatang(result.checksumSatang)}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="receipt-c" className="font-medium">
          Receipt
        </label>
        <input
          id="receipt-c"
          value={receiptText}
          onChange={(e) => onReceiptChange(e.target.value)}
          inputMode="decimal"
          className="w-24 rounded border border-black/20 bg-transparent p-2 text-right tabular-nums dark:border-white/25"
        />
        <span className={`font-bold ${matches ? "text-emerald-600" : "text-red-500"}`}>
          {matches ? "✓" : "✗"}
        </span>
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-4xl p-4 pb-40 lg:grid lg:grid-cols-[1fr_300px] lg:gap-6">
      <div>
        <header className="mb-3">
          <h1 className="text-lg font-bold">Katsu Lunch — 15 Jul</h1>
          <p className="text-sm opacity-60">Draft · tap an item to assign</p>
        </header>

        <ul className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const unticked = result.untickedItemIds.includes(item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                  className="flex w-full items-center gap-2 p-3 text-left"
                >
                  <span className="flex-1">
                    <span className="block font-medium">{item.name}</span>
                    <span className={`block text-xs ${unticked ? "text-red-500" : "opacity-60"}`}>
                      {unticked
                        ? "nobody yet"
                        : item.tickedBy
                            .map((id) => (peerById.get(id) as Peer).name)
                            .join(", ")}
                    </span>
                  </span>
                  <span className="tabular-nums opacity-70">
                    {formatSatang(item.unitPriceSatang * item.qty)}
                  </span>
                  <span className="opacity-40">{expanded ? "▾" : "▸"}</span>
                </button>
                {expanded && (
                  <div className="flex flex-wrap gap-2 px-3 pb-3">
                    {peers.map((peer) => {
                      const ticked = item.tickedBy.includes(peer.id);
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
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
          {totalsPanel}
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-16 border-t border-black/10 bg-background/95 backdrop-blur lg:hidden dark:border-white/15">
        <button
          type="button"
          onClick={() => setSheetOpen((open) => !open)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="font-semibold">
            Checksum {formatSatang(result.checksumSatang)}
          </span>
          <span className={`text-sm font-bold ${matches ? "text-emerald-600" : "text-red-500"}`}>
            {matches ? "✓" : "✗"} {sheetOpen ? "▾" : "▴"}
          </span>
        </button>
        {sheetOpen && (
          <div className="border-t border-black/10 px-4 py-3 dark:border-white/15">
            {totalsPanel}
          </div>
        )}
      </div>
    </main>
  );
}
