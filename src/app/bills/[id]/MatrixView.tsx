"use client";

import RoundingLeftoverBadge from "@/components/RoundingLeftoverBadge";
import { formatMinorUnits, formatSatang } from "@/lib/billing/money";
import type { BillResult } from "@/lib/billing/types";
import type { LineItemRow, PeerRow, TickRow } from "@/lib/bills/types";
import { receiptStatus, receiptStatusCls } from "./BillEditor";

interface Props {
  items: LineItemRow[];
  peers: PeerRow[];
  ticks: TickRow[];
  result: BillResult;
  receiptTotalSatang: number;
  billDiscountPercent: number;
  billDiscountSatang: number;
  selfPeerId: string | null;
  /** #38: when set, item prices/shares render in this currency instead of ฿ (always THB). */
  purchaseCurrency: string | null;
  onToggle: (lineItemId: string, peerId: string) => void;
  onUpdateBillAbsorber: (peerId: string) => void;
}

/** Desktop (>=lg): sheet-like matrix — items as rows, peers as columns. */
export default function MatrixView({
  items,
  peers,
  ticks,
  result,
  receiptTotalSatang,
  billDiscountPercent,
  billDiscountSatang,
  selfPeerId,
  purchaseCurrency,
  onToggle,
  onUpdateBillAbsorber,
}: Props) {
  const tickSet = new Set(ticks.map((tick) => `${tick.line_item_id}:${tick.peer_id}`));
  const receipt = receiptStatus(receiptTotalSatang, result.checksumSatang);
  const hasDiscount =
    billDiscountPercent > 0 ||
    billDiscountSatang > 0 ||
    items.some((item) => item.discount_percent > 0 || item.discount_satang > 0);
  const peerNames = Object.fromEntries(peers.map((peer) => [peer.id, peer.name]));

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
              <th className="p-2 text-right font-semibold">{purchaseCurrency ?? "฿"}</th>
              {peers.map((peer) => (
                <th key={peer.id} className="min-w-14 p-2 text-center font-semibold">
                  {peer.name}
                  {peer.id === selfPeerId && (
                    <span className="block text-[11px] font-normal text-primary-ink">คุณ</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const unticked = result.untickedItemIds.includes(item.id);
              const tickedPeerIds = peers
                .filter((peer) => tickSet.has(`${item.id}:${peer.id}`))
                .map((peer) => peer.id);
              const tickerCount = tickedPeerIds.length;
              const firstTicker = tickedPeerIds[0];
              const share =
                firstTicker !== undefined ? result.itemSplits[item.id]?.[firstTicker] : undefined;
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
                    {!unticked && share !== undefined && (
                      <p className="mt-1 text-xs tabular-nums text-ink-muted">
                        ÷ {tickerCount} ={" "}
                        {purchaseCurrency ? formatMinorUnits(share, purchaseCurrency) : formatSatang(share)}{" "}
                        ต่อคน
                      </p>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums text-ink-muted">
                    {purchaseCurrency
                      ? formatMinorUnits(item.unit_price_satang * item.qty, purchaseCurrency)
                      : formatSatang(item.unit_price_satang * item.qty)}
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
                          className={`h-11 w-12 rounded-lg border text-lg font-bold transition active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink ${
                            ticked
                              ? "border-transparent bg-primary text-white hover:bg-primary-deep"
                              : "border-border bg-surface text-ink-muted/40 hover:border-primary hover:bg-surface-tint"
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
            {hasDiscount && (
              <tr className="border-t border-border/60 text-ink-muted">
                <td className="sticky left-0 z-10 bg-surface p-2">ส่วนลด</td>
                <td className="p-2 text-right tabular-nums">
                  −{formatSatang(result.discountSatang)}
                </td>
                {peers.map((peer) => (
                  <td key={peer.id} className="p-2 text-center tabular-nums">
                    −{formatSatang(result.peerBreakdowns[peer.id]?.discountSatang ?? 0)}
                  </td>
                ))}
              </tr>
            )}
            <tr className="border-t border-border/60 text-ink-muted">
              <td className="sticky left-0 z-10 bg-surface p-2">รวมเป็นเงิน</td>
              <td className="p-2 text-right tabular-nums">
                {formatSatang(result.subtotalSatang)}
              </td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
                  {formatSatang(result.peerBreakdowns[peer.id]?.subtotalSatang ?? 0)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 text-ink-muted">
              <td className="sticky left-0 z-10 bg-surface p-2">Service charge</td>
              <td className="p-2 text-right tabular-nums">
                {formatSatang(result.serviceChargeSatang)}
              </td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
                  {formatSatang(result.peerBreakdowns[peer.id]?.serviceChargeSatang ?? 0)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 text-ink-muted">
              <td className="sticky left-0 z-10 bg-surface p-2">VAT</td>
              <td className="p-2 text-right tabular-nums">{formatSatang(result.vatSatang)}</td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
                  {/* ADR-0011 known limitation: the negative-remainder guard can make a
                      non-absorber's displayed VAT residual negative even though their real
                      total never does. Clamp the display only, not the underlying math. */}
                  {formatSatang(Math.max(0, result.peerBreakdowns[peer.id]?.vatSatang ?? 0))}
                </td>
              ))}
            </tr>
            <tr className="border-t-2 border-ink/20 font-semibold">
              <td className="sticky left-0 z-10 bg-surface p-2">
                รวมต่อคน
                {result.billLeftover && (
                  <div className="mt-1">
                    <RoundingLeftoverBadge
                      leftoverSatang={result.billLeftover.leftoverSatang}
                      candidateIds={peers.map((peer) => peer.id)}
                      candidateNames={peerNames}
                      absorberId={result.billLeftover.absorberPeerId}
                      onChange={onUpdateBillAbsorber}
                    />
                  </div>
                )}
              </td>
              <td className="p-2 text-right tabular-nums">
                {formatSatang(result.checksumSatang)}
              </td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
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
