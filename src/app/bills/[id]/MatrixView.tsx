"use client";

import RoundingLeftoverBadge from "@/components/RoundingLeftoverBadge";
import { useMeasuredWidth } from "@/hooks/useMeasuredWidth";
import { formatAmount, formatSatang } from "@/lib/billing/money";
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
  // Every footer row's price column stays in that column's own currency (Purchase Currency
  // when set, matching the item rows and header above it); the peer columns beside each row
  // stay THB always — those are the actual settlement figures, never converted back.
  const checkFigures = result.purchase ?? result;
  // #38: bare number when FX is on -- the header and caption already state the currency
  // once, so repeating "TWD" on every cell (formatMinorUnits) was the exact redundancy
  // flagged from testing. formatSatang stays untouched when FX is off (pre-#38 behavior).
  const formatCheck = (amountMinor: number) =>
    purchaseCurrency ? formatAmount(amountMinor) : formatSatang(amountMinor);
  // #38: every intermediate row (discount/subtotal/SC/VAT) is receipt-native — the FX
  // conversion only happens once, at the very end. So a peer's per-row figure here reads
  // in Purchase Currency throughout, same scale as the row's own reference column beside
  // it; only the final "รวมต่อคน" row below converts to THB, since that's the one number
  // that actually gets paid.
  const peerCheckFigures = (peerId: string) => result.purchase?.peerBreakdowns[peerId] ?? result.peerBreakdowns[peerId];
  const peerCheckTotal = (peerId: string) => result.purchase?.peerTotals[peerId] ?? result.peerTotals[peerId] ?? 0;
  const rateText = result.purchase
    ? `1 ${result.purchase.currency} = ฿${(result.purchase.rateNumerator / result.purchase.rateDenominator).toString()}`
    : "";
  // #38: receiptTotalSatang is always the Purchase Currency figure (what's on the paper
  // receipt), so it must check against the Purchase-scale checksum, not the THB one — and
  // the mismatch amount must format in that same currency, not hardcode ฿.
  const receipt = receiptStatus(
    receiptTotalSatang,
    result.purchase ? result.purchase.checksumSatang : result.checksumSatang,
    formatCheck,
  );
  const hasDiscount =
    billDiscountPercent > 0 ||
    billDiscountSatang > 0 ||
    items.some((item) => item.discount_percent > 0 || item.discount_satang > 0);
  const peerNames = Object.fromEntries(peers.map((peer) => [peer.id, peer.name]));
  // #38: the reference/currency column is pinned right after the sticky item-name column so
  // it stays visible while scrolling to tick far-right peers, instead of a separate box
  // repeating the same total. Its width varies with item names, so the offset is measured
  // (see useMeasuredWidth), not a guessed constant.
  const [firstColRef, firstColWidth] = useMeasuredWidth<HTMLTableCellElement>();
  const refColCls = "sticky z-10 text-right tabular-nums";
  const refColStyle = { left: firstColWidth };

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
      {result.purchase && (
        <p className="text-xs text-ink-muted">
          ตารางนี้แสดงเป็น {result.purchase.currency} ตามใบเสร็จ
        </p>
      )}
      <div className="overflow-x-auto pb-2">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th ref={firstColRef} className="sticky left-0 z-10 bg-surface p-2 text-left font-semibold">
                เมนู
              </th>
              <th className={`${refColCls} bg-surface p-2 font-semibold`} style={refColStyle}>
                {purchaseCurrency ?? "฿"}
              </th>
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
                        ÷ {tickerCount} = {formatCheck(share)} ต่อคน
                      </p>
                    )}
                  </td>
                  <td className={`${refColCls} bg-surface p-2 text-ink-muted`} style={refColStyle}>
                    {formatCheck(item.unit_price_satang * item.qty)}
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
                <td className={`${refColCls} bg-surface p-2`} style={refColStyle}>
                  −{formatCheck(checkFigures.discountSatang)}
                </td>
                {peers.map((peer) => (
                  <td key={peer.id} className="p-2 text-center tabular-nums">
                    −{formatCheck(peerCheckFigures(peer.id)?.discountSatang ?? 0)}
                  </td>
                ))}
              </tr>
            )}
            <tr className="border-t border-border/60 text-ink-muted">
              <td className="sticky left-0 z-10 bg-surface p-2">รวมเป็นเงิน</td>
              <td className={`${refColCls} bg-surface p-2`} style={refColStyle}>
                {formatCheck(checkFigures.subtotalSatang)}
              </td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
                  {formatCheck(peerCheckFigures(peer.id)?.subtotalSatang ?? 0)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 text-ink-muted">
              <td className="sticky left-0 z-10 bg-surface p-2">Service charge</td>
              <td className={`${refColCls} bg-surface p-2`} style={refColStyle}>
                {formatCheck(checkFigures.serviceChargeSatang)}
              </td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
                  {formatCheck(peerCheckFigures(peer.id)?.serviceChargeSatang ?? 0)}
                </td>
              ))}
            </tr>
            <tr className="border-t border-border/60 text-ink-muted">
              <td className="sticky left-0 z-10 bg-surface p-2">VAT</td>
              <td className={`${refColCls} bg-surface p-2`} style={refColStyle}>{formatCheck(checkFigures.vatSatang)}</td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
                  {/* ADR-0011 known limitation: the negative-remainder guard can make a
                      non-absorber's displayed VAT residual negative even though their real
                      total never does. Clamp the display only, not the underlying math. */}
                  {formatCheck(Math.max(0, peerCheckFigures(peer.id)?.vatSatang ?? 0))}
                </td>
              ))}
            </tr>
            <tr className="border-t-2 border-ink/20 font-semibold">
              <td className="sticky left-0 z-10 bg-surface p-2">
                รวมต่อคน
                {/* #38: no rounding chip here when FX is on -- leftoverSatang is always THB,
                    which doesn't belong on this still-receipt-native row. It moves to
                    ยอดที่ต้องจ่าย below, the row that's actually in that currency. */}
                {result.billLeftover && !result.purchase && (
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
              <td className={`${refColCls} bg-surface p-2`} style={refColStyle}>
                {formatCheck(checkFigures.checksumSatang)}
              </td>
              {peers.map((peer) => (
                <td key={peer.id} className="p-2 text-center tabular-nums">
                  {formatCheck(peerCheckTotal(peer.id))}
                </td>
              ))}
            </tr>
            {result.purchase && (
              <>
                <tr aria-hidden="true">
                  <td colSpan={2 + peers.length} className="h-2 border-none p-0" />
                </tr>
                <tr className="bg-surface-tint font-semibold text-primary-ink">
                  <td className="sticky left-0 z-10 bg-surface-tint p-2">
                    {/* #38: whitespace-nowrap pins this column to fit "label + rate" on one
                        line -- the actual fix for the wrap bug, not a guessed min-width. The
                        pinned reference column right after it (refColStyle) rides along at
                        whatever width this ends up needing. */}
                    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                      ยอดที่ต้องจ่าย
                      <span className="text-xs font-normal opacity-80">({rateText})</span>
                    </span>
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
                  <td className={`${refColCls} bg-surface-tint p-2`} style={refColStyle}>
                    {formatSatang(result.checksumSatang)}
                  </td>
                  {peers.map((peer) => (
                    <td key={peer.id} className="bg-surface-tint p-2 text-center tabular-nums">
                      {formatSatang(result.peerTotals[peer.id] ?? 0)}
                    </td>
                  ))}
                </tr>
              </>
            )}
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
