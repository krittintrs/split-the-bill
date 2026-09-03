"use client";

import { useState } from "react";
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
  selfPeerId: string | null;
  /** #38: when set, item prices/shares render in this currency instead of ฿ (always THB). */
  purchaseCurrency: string | null;
  onToggle: (lineItemId: string, peerId: string) => void;
  onUpdateBillAbsorber: (peerId: string) => void;
}

/** Mobile (<lg): stacked item cards + sticky expandable totals bar. */
export default function CardsView({
  items,
  peers,
  ticks,
  result,
  receiptTotalSatang,
  selfPeerId,
  purchaseCurrency,
  onToggle,
  onUpdateBillAbsorber,
}: Props) {
  const [totalsOpen, setTotalsOpen] = useState(false);
  const tickSet = new Set(ticks.map((tick) => `${tick.line_item_id}:${tick.peer_id}`));
  const formatCheck = (amountMinor: number) =>
    purchaseCurrency ? formatMinorUnits(amountMinor, purchaseCurrency) : formatSatang(amountMinor);
  // #38: receiptTotalSatang is always the Purchase Currency figure (what's on the paper
  // receipt), so it must check against the Purchase-scale checksum, not the THB one, and
  // format the mismatch amount in that same currency, not hardcode ฿.
  // "ยอดรวม" below stays THB deliberately — it's the Checksum by CONTEXT.md's definition,
  // the settleable figure, not tied to a currency-labeled column the way MatrixView's is.
  const receipt = receiptStatus(
    receiptTotalSatang,
    result.purchase ? result.purchase.checksumSatang : result.checksumSatang,
    formatCheck,
  );
  const peerNames = Object.fromEntries(peers.map((peer) => [peer.id, peer.name]));

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
          const tickedPeerIds = peers
            .filter((peer) => tickSet.has(`${item.id}:${peer.id}`))
            .map((peer) => peer.id);
          const tickerCount = tickedPeerIds.length;
          const firstTicker = tickedPeerIds[0];
          const share = firstTicker !== undefined ? result.itemSplits[item.id]?.[firstTicker] : undefined;
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
                  {purchaseCurrency
                    ? formatMinorUnits(item.unit_price_satang * item.qty, purchaseCurrency)
                    : formatSatang(item.unit_price_satang * item.qty)}
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
                      className={`min-h-11 rounded-full px-4 py-2 text-sm transition active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink ${
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
                    ÷ {tickerCount} ={" "}
                    {purchaseCurrency ? formatMinorUnits(share, purchaseCurrency) : formatSatang(share)}{" "}
                    ต่อคน
                  </p>
                )
              )}
            </div>
          );
        })}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        {/* #38: total, badge, and receipt-status used to share one flex-wrap row -- with
            longer currency-prefixed amounts that no longer fit, and flex-wrap just broke
            them across lines unpredictably instead of failing cleanly. Two fixed rows
            instead: total (with the expand chevron) alone on row 1, badge + status on
            row 2. RoundingLeftoverBadge is itself a button (+ its own portal'd menu), so
            it and the status label stay two separate toggle buttons rather than one
            wrapping everything -- nesting interactive elements inside a <button> is
            invalid HTML that browsers mishandle. Either toggles the sheet; the badge
            opens its own picker, always visible with zero taps (matches MatrixView's
            always-visible รวมต่อคน row -- the equivalent here is the collapsed bar, not
            the expandable panel below it). */}
        <div className="flex w-full flex-col gap-1 px-4 py-3">
          <button
            type="button"
            onClick={() => setTotalsOpen((open) => !open)}
            aria-expanded={totalsOpen}
            className="flex min-h-7 w-full items-center justify-between gap-2 text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ink"
          >
            <span className="truncate font-semibold tabular-nums">
              ยอดรวม {formatSatang(result.checksumSatang)}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              className={`shrink-0 text-ink-muted transition-transform ${totalsOpen ? "" : "rotate-180"}`}
            >
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex min-h-7 w-full flex-wrap items-center gap-x-2 gap-y-1">
            {result.billLeftover && (
              <RoundingLeftoverBadge
                leftoverSatang={result.billLeftover.leftoverSatang}
                candidateIds={peers.map((peer) => peer.id)}
                candidateNames={peerNames}
                absorberId={result.billLeftover.absorberPeerId}
                onChange={onUpdateBillAbsorber}
                openDirection="up"
              />
            )}
            <button
              type="button"
              onClick={() => setTotalsOpen((open) => !open)}
              aria-expanded={totalsOpen}
              className={`flex items-center text-sm font-bold transition active:scale-[0.99] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-ink ${receiptStatusCls(receipt.state)}`}
            >
              {receipt.label}
            </button>
          </div>
        </div>
        {totalsOpen && (
          <div className="max-h-[45dvh] overflow-y-auto border-t border-border px-4 py-3">
            {/* #38: only in the expanded panel, not the already-tight collapsed bar --
                the Purchase-scale figures alongside the THB ones peers already see. */}
            {result.purchase && (
              <div className="mb-3 flex flex-col gap-0.5 border-b border-dashed border-border pb-3 text-xs">
                <div className="flex justify-between tabular-nums text-ink-muted">
                  <span>รวมตามใบเสร็จ ({result.purchase.currency})</span>
                  <span className="text-ink">
                    {formatMinorUnits(result.purchase.checksumSatang, result.purchase.currency)}
                  </span>
                </div>
                <div className="flex justify-between tabular-nums text-ink-muted">
                  <span>
                    แปลงเป็นบาท (1 {result.purchase.currency} = ฿
                    {(result.purchase.rateNumerator / result.purchase.rateDenominator).toString()})
                  </span>
                  <span className="text-ink">{formatSatang(result.checksumSatang)}</span>
                </div>
              </div>
            )}
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              {peers.map((peer) => (
                <li key={peer.id} className="flex justify-between tabular-nums">
                  <span>
                    {peer.name}
                    {peer.id === selfPeerId && (
                      <span className="ml-1 text-xs text-primary-ink">(คุณ)</span>
                    )}
                  </span>
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
