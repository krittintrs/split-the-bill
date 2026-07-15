// PROTOTYPE — Variant A: sheet-like matrix, in two orientations.
// A  = items as rows, peers as columns (like the old Google Sheet).
// A2 = transposed: peers as rows, items as columns.
// Mobile scrolls horizontally with the first column pinned.
import { formatSatang } from "@/lib/billing/money";
import type { VariantProps } from "./shared";
import BillMetaFields from "./BillMetaFields";

function TickButton({
  ticked,
  onClick,
}: {
  ticked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 w-12 rounded ${
        ticked
          ? "bg-emerald-500 font-bold text-white"
          : "bg-black/5 text-black/30 dark:bg-white/10 dark:text-white/30"
      }`}
    >
      {ticked ? "✓" : "·"}
    </button>
  );
}

export default function VariantA({
  transposed = false,
  ...props
}: VariantProps & { transposed?: boolean }) {
  const { items, peers, result, receiptText, billMeta, onToggle, onReceiptChange, onMetaChange } =
    props;

  return (
    <main className="mx-auto max-w-6xl p-4 pb-32">
      <header className="mb-3">
        <h1 className="text-lg font-bold">Katsu Lunch — 15 Jul</h1>
        <p className="text-sm opacity-60">
          Draft · {transposed ? "peers as rows" : "items as rows"}
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
        {!transposed ? (
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/15">
                <th className="sticky left-0 z-10 bg-background p-2 text-left font-semibold">
                  Item
                </th>
                <th className="p-2 text-right font-semibold">฿</th>
                {peers.map((peer) => (
                  <th key={peer.id} className="w-14 p-2 text-center font-semibold">
                    {peer.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-black/5 dark:border-white/10">
                  <td className="sticky left-0 z-10 bg-background p-2 whitespace-nowrap">
                    {item.name}
                    {item.discountPercent ? (
                      <span className="ml-1 text-xs opacity-50">−{item.discountPercent}%</span>
                    ) : null}
                    {result.untickedItemIds.includes(item.id) && (
                      <span className="ml-1 text-xs text-red-500">unticked!</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums opacity-70">
                    {formatSatang(item.unitPriceSatang * item.qty)}
                  </td>
                  {peers.map((peer) => (
                    <td key={peer.id} className="p-1 text-center">
                      <TickButton
                        ticked={item.tickedBy.includes(peer.id)}
                        onClick={() => onToggle(item.id, peer.id)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/20 font-semibold dark:border-white/30">
                <td className="sticky left-0 z-10 bg-background p-2">Total</td>
                <td className="p-2 text-right tabular-nums">
                  {formatSatang(result.checksumSatang)}
                </td>
                {peers.map((peer) => (
                  <td key={peer.id} className="p-2 text-center text-xs tabular-nums">
                    {formatSatang(result.peerTotals[peer.id])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/15">
                <th className="sticky left-0 z-10 bg-background p-2 text-left font-semibold">
                  Peer
                </th>
                {items.map((item) => (
                  <th key={item.id} className="max-w-24 p-2 text-center align-bottom">
                    <span
                      className={`block truncate text-xs font-semibold ${
                        result.untickedItemIds.includes(item.id) ? "text-red-500" : ""
                      }`}
                    >
                      {item.name}
                    </span>
                    <span className="block text-[10px] font-normal tabular-nums opacity-60">
                      {formatSatang(item.unitPriceSatang * item.qty)}
                    </span>
                  </th>
                ))}
                <th className="p-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {peers.map((peer) => (
                <tr key={peer.id} className="border-b border-black/5 dark:border-white/10">
                  <td className="sticky left-0 z-10 bg-background p-2 font-medium whitespace-nowrap">
                    {peer.name}
                  </td>
                  {items.map((item) => (
                    <td key={item.id} className="p-1 text-center">
                      <TickButton
                        ticked={item.tickedBy.includes(peer.id)}
                        onClick={() => onToggle(item.id, peer.id)}
                      />
                    </td>
                  ))}
                  <td className="p-2 text-right font-semibold tabular-nums">
                    {formatSatang(result.peerTotals[peer.id])}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/20 font-semibold dark:border-white/30">
                <td className="sticky left-0 z-10 bg-background p-2">Checksum</td>
                <td colSpan={items.length} />
                <td className="p-2 text-right tabular-nums">
                  {formatSatang(result.checksumSatang)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <BillMetaFields
          billMeta={billMeta}
          onMetaChange={onMetaChange}
          receiptText={receiptText}
          onReceiptChange={onReceiptChange}
          checksumSatang={result.checksumSatang}
        />
      </div>
    </main>
  );
}
