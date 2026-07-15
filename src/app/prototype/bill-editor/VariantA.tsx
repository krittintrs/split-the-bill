// PROTOTYPE — Variant A: sheet-like matrix. Items are rows, peers are
// columns, exactly like the old Google Sheet. Mobile scrolls horizontally
// with the item column pinned.
import { formatSatang } from "@/lib/billing/money";
import { parseThbToSatang, type VariantProps } from "./shared";

export default function VariantA({
  items,
  peers,
  result,
  receiptText,
  onToggle,
  onReceiptChange,
}: VariantProps) {
  const receiptSatang = parseThbToSatang(receiptText);
  const matches = receiptSatang !== null && receiptSatang === result.checksumSatang;

  return (
    <main className="mx-auto max-w-5xl p-4 pb-32">
      <header className="mb-3">
        <h1 className="text-lg font-bold">Katsu Lunch — 15 Jul</h1>
        <p className="text-sm opacity-60">Draft · tick who ate what</p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
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
              <tr
                key={item.id}
                className="border-b border-black/5 dark:border-white/10"
              >
                <td className="sticky left-0 z-10 bg-background p-2">
                  {item.name}
                  {result.untickedItemIds.includes(item.id) && (
                    <span className="ml-1 text-xs text-red-500">unticked!</span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums opacity-70">
                  {formatSatang(item.unitPriceSatang * item.qty)}
                </td>
                {peers.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  return (
                    <td key={peer.id} className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => onToggle(item.id, peer.id)}
                        className={`h-10 w-12 rounded ${
                          ticked
                            ? "bg-emerald-500 font-bold text-white"
                            : "bg-black/5 text-black/30 dark:bg-white/10 dark:text-white/30"
                        }`}
                      >
                        {ticked ? "✓" : "·"}
                      </button>
                    </td>
                  );
                })}
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
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <label className="text-sm font-medium" htmlFor="receipt-a">
          Receipt total
        </label>
        <input
          id="receipt-a"
          value={receiptText}
          onChange={(e) => onReceiptChange(e.target.value)}
          inputMode="decimal"
          className="w-28 rounded border border-black/20 bg-transparent p-2 text-right tabular-nums dark:border-white/25"
        />
        <span className={`text-sm font-bold ${matches ? "text-emerald-600" : "text-red-500"}`}>
          {matches ? "✓ matches checksum" : `✗ checksum is ${formatSatang(result.checksumSatang)}`}
        </span>
      </div>
    </main>
  );
}
