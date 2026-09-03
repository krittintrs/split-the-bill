"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import PaybackControls from "./PaybackControls";
import { computeBill } from "@/lib/billing/compute";
import { itemShareSatang, itemTotalSatang } from "@/lib/billing/itemShare";
import { formatAmount, formatMinorUnits, formatSatang } from "@/lib/billing/money";
import type { BillInput } from "@/lib/billing/types";
import { fetchBill, type GetBillJson } from "@/lib/bills/getBill";
import { setBillStatus } from "@/lib/bills/mutations";
import { setPaid as setPaidRpc, setTick as setTickRpc, subscribeBillChanged } from "@/lib/bills/peer";
import { createClient } from "@/lib/supabase/client";

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" });

/**
 * Fixed-width trailing "status slot" shared by every row variant in the ทุกคน
 * list (self-row's invisible clone, a claimed peer's status span, an unclaimed
 * peer's pay button) so a row's total — pinned right via the sibling `ml-auto`
 * — always lands at the same horizontal position regardless of which status
 * string (or none) that row happens to render. w-28 comfortably fits the
 * widest string, "✓ จ่ายแล้ว"; centered so text sits mid-line in every variant,
 * matching what the plain pay button already did before this existed.
 */
const STATUS_SLOT_CLS =
  "inline-flex min-h-10 w-28 shrink-0 items-center justify-center rounded-full px-2 py-1 text-xs font-semibold";

/** Read-only, always-visible (no hover) note on the peer who keeps the bill's
 * rounding discount (ADR-0011) — peers never get the organizer's picker, but
 * a few-satang gap between two otherwise-identical totals needs an explanation.
 * `inverted` switches to a solid white chip for use inside a claimed peer's
 * solid-blue header button — the default translucent-amber styling is tuned
 * for a white/washed surface and all but disappears against `bg-primary`. */
function RoundingDiscountNote({
  leftoverSatang,
  inverted = false,
}: {
  leftoverSatang: number;
  inverted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        inverted
          ? "border-white/60 bg-white text-warning-ink"
          : "border-warning-ink/30 bg-warning-ink/10 text-warning-ink"
      }`}
      title={`ได้รับส่วนลดปัดเศษ ${formatSatang(leftoverSatang)}`}
    >
      −{formatSatang(leftoverSatang)} ปัดเศษ
    </span>
  );
}

// The device-local claim ("which name is mine") lives in localStorage, read as
// an external store so it stays SSR-safe (server snapshot = null) without a
// setState-in-effect. claim() writes then notifies same-tab subscribers.
const claimListeners = new Set<() => void>();
function subscribeClaim(cb: () => void): () => void {
  claimListeners.add(cb);
  if (typeof window !== "undefined") window.addEventListener("storage", cb);
  return () => {
    claimListeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", cb);
  };
}

interface DisplayItem {
  id: string;
  name: string;
  unitPriceSatang: number;
  qty: number;
  discountPercent?: number;
  discountAmountSatang?: number;
  tickedBy: string[];
}

export default function PeerBill({
  billId,
  initial,
  isOwner,
}: {
  billId: string;
  initial: GetBillJson;
  isOwner: boolean;
}) {
  const [bill, setBill] = useState<GetBillJson>(initial);
  const [pending, setPending] = useState(false);
  // Device-local "which name is mine" — no login (design C+, ADR-0002).
  const claimKey = `claim:${billId}`;
  const claimedId = useSyncExternalStore(
    subscribeClaim,
    () => localStorage.getItem(claimKey),
    () => null,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  function claim(peerId: string) {
    localStorage.setItem(claimKey, peerId);
    claimListeners.forEach((cb) => cb()); // notify same-tab subscribers
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const refetch = useCallback(async () => {
    const json = await fetchBill(createClient(), billId);
    if (json) setBill(json);
    // null (draft/deleted mid-session) keeps the last known state on screen.
  }, [billId]);

  useEffect(() => {
    const unsubscribe = subscribeBillChanged(billId, () => void refetch());
    // catch anything that changed between SSR snapshot and channel join
    const initialSync = setTimeout(() => void refetch(), 0);
    return () => {
      clearTimeout(initialSync);
      unsubscribe();
    };
  }, [billId, refetch]);

  const tickedByItem = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const tick of bill.ticks) {
      const list = map.get(tick.lineItemId) ?? [];
      list.push(tick.peerId);
      map.set(tick.lineItemId, list);
    }
    return map;
  }, [bill.ticks]);

  const itemsSorted = useMemo(
    () => [...bill.items].sort((a, b) => a.position - b.position),
    [bill.items],
  );

  // #26: never render from bill.peers directly. get_bill orders peers, but a
  // realtime refetch must not be able to reshuffle columns under someone mid-tap,
  // so we re-sort on the same (addedAt, id) key the server used.
  //
  // Plain < / > rather than localeCompare: these are ISO timestamps and UUIDs,
  // and ICU collation orders "." before "+", so localeCompare ranks
  // "…:25+00:00" after "…:25.5+00:00" and disagrees across browser locales.
  // Byte order matches Postgres. Missing addedAt (payload predating the
  // ordering migration) degrades to the id tiebreak instead of throwing.
  const peersSorted = useMemo(
    () =>
      [...bill.peers].sort((a, b) => {
        const aAdded = a.addedAt ?? "";
        const bAdded = b.addedAt ?? "";
        if (aAdded !== bAdded) return aAdded < bAdded ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }),
    [bill.peers],
  );

  // ADR-0010: the organizer's own row shows its ticks and total so the split
  // reconciles against the receipt, but it owes nobody: no claim, no QR, no paid.
  const selfPeerId = peersSorted.find((peer) => peer.isSelf)?.id ?? null;

  const displayItems: DisplayItem[] = useMemo(
    () =>
      itemsSorted.map((item) => ({
        id: item.id,
        name: item.name,
        unitPriceSatang: item.unitPriceSatang,
        qty: item.qty,
        discountPercent: item.discountPercent,
        discountAmountSatang: item.discountSatang,
        tickedBy: tickedByItem.get(item.id) ?? [],
      })),
    [itemsSorted, tickedByItem],
  );

  // #38: a blank/whitespace-only purchaseCurrency (organizer mid-edit, toggle just flipped
  // on) must compute gracefully as "no FX yet" — same reasoning as mapToBillInput.
  const purchaseCurrency = bill.bill.purchaseCurrency?.trim() || undefined;

  const billInput: BillInput = useMemo(
    () => ({
      items: displayItems,
      peerIds: peersSorted.map((peer) => peer.id),
      billDiscount: {
        percent: bill.bill.billDiscountPercent,
        amountSatang: bill.bill.billDiscountSatang,
      },
      serviceChargePercent: bill.bill.serviceChargePercent,
      vatPercent: bill.bill.vatPercent,
      roundingAbsorberPeerId: bill.bill.roundingAbsorberPeerId ?? undefined,
      purchaseCurrency,
      fxRateNumerator: purchaseCurrency ? (bill.bill.fxRateNumerator ?? undefined) : undefined,
      fxRateDenominator: purchaseCurrency ? (bill.bill.fxRateDenominator ?? undefined) : undefined,
    }),
    [displayItems, peersSorted, bill.bill, purchaseCurrency],
  );

  const result = useMemo(() => computeBill(billInput), [billInput]);
  const locked = bill.bill.status === "locked";
  const peerName = new Map(peersSorted.map((peer) => [peer.id, peer.name]));

  const hasDiscount =
    bill.bill.billDiscountPercent > 0 ||
    bill.bill.billDiscountSatang > 0 ||
    displayItems.some((item) => (item.discountPercent ?? 0) > 0 || (item.discountAmountSatang ?? 0) > 0);

  async function onTick(itemId: string, peerId: string) {
    if (locked) return;
    const alreadyTicked = (tickedByItem.get(itemId) ?? []).includes(peerId);
    setBill((prev) => ({
      ...prev,
      ticks: alreadyTicked
        ? prev.ticks.filter((t) => !(t.lineItemId === itemId && t.peerId === peerId))
        : [...prev.ticks, { lineItemId: itemId, peerId }],
    }));
    setPending(true);
    try {
      await setTickRpc(billId, itemId, peerId, !alreadyTicked);
    } catch {
      await refetch();
    } finally {
      setPending(false);
    }
  }

  async function onPaid(peerId: string) {
    const wasPaid = peersSorted.find((peer) => peer.id === peerId)?.paidAt != null;
    setBill((prev) => ({
      ...prev,
      peers: prev.peers.map((peer) =>
        peer.id === peerId
          ? { ...peer, paidAt: wasPaid ? null : new Date().toISOString() }
          : peer,
      ),
    }));
    setPending(true);
    try {
      await setPaidRpc(billId, peerId, !wasPaid);
    } catch {
      await refetch();
    } finally {
      setPending(false);
    }
  }

  async function onLockToggle() {
    setPending(true);
    try {
      await setBillStatus(billId, locked ? "open" : "locked");
    } catch {
      // RLS denies non-owners; refetch below restores the true status either way
    } finally {
      setPending(false);
      await refetch();
    }
  }

  const paid: Record<string, boolean> = {};
  for (const peer of peersSorted) paid[peer.id] = peer.paidAt != null;

  // Ignore a stale claim whose peer was removed from the bill, or one stored on
  // the organizer's row before this shipped: you cannot claim, or pay, yourself.
  const validClaimId =
    claimedId && claimedId !== selfPeerId && peersSorted.some((peer) => peer.id === claimedId)
      ? claimedId
      : null;

  const paybackPanel = validClaimId ? (
    <div ref={panelRef}>
      <PaybackControls
        peerName={peerName.get(validClaimId) ?? ""}
        totalSatang={result.peerTotals[validClaimId] ?? 0}
        promptpayId={bill.bill.promptpayId}
        bankName={bill.bill.bankName}
        bankAccount={bill.bill.bankAccount}
        accountName={bill.bill.accountName}
        paid={paid[validClaimId] ?? false}
        onPaid={() => onPaid(validClaimId)}
        pending={pending}
      />
    </div>
  ) : (
    <div
      ref={panelRef}
      className="rounded-2xl border-2 border-dashed border-border bg-surface-tint/60 p-6 text-center"
    >
      <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-tint text-xl text-primary-ink">
        ↓
      </div>
      <p className="font-bold">แตะชื่อของคุณด้านล่าง</p>
      <p className="text-sm text-ink-muted">เพื่อรับ QR และยอดที่ต้องจ่าย</p>
    </div>
  );

  const itemsSection = (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 font-semibold">รายการ — ติ๊กที่เรากิน</h2>
      <ul className="flex flex-col gap-4">
        {displayItems.map((item) => {
          const share = itemShareSatang(item);
          const itemTotal = itemTotalSatang(item);
          return (
            <li key={item.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{item.name || "ไม่มีชื่อเมนู"}</span>
                <span className="tabular-nums text-ink-muted">
                  {bill.bill.purchaseCurrency
                    ? formatMinorUnits(itemTotal, bill.bill.purchaseCurrency)
                    : formatSatang(itemTotal)}
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                {/* #38: no currency prefix here -- the total right above already shows it. */}
                {share === null ? "ยังไม่มีคนติ๊ก" : `${formatAmount(share)} / คน × ${item.tickedBy.length}`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {peersSorted.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  return (
                    <button
                      key={peer.id}
                      type="button"
                      disabled={locked || pending}
                      onClick={() => onTick(item.id, peer.id)}
                      className={`min-h-10 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                        ticked
                          ? "bg-primary text-white hover:bg-primary-deep"
                          : "bg-surface-tint text-ink hover:bg-border"
                      }`}
                    >
                      {ticked ? "✓ " : ""}
                      {peer.name}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const everyoneSection = (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-2 font-semibold">ทุกคน — แตะชื่อคุณเพื่อรับ QR</h2>
      <ul className="flex flex-col divide-y divide-border">
        {peersSorted.map((peer) => {
          const isClaimed = claimedId === peer.id;
          const peerTotal = result.peerTotals[peer.id] ?? 0;
          const absorbsLeftover = result.billLeftover?.absorberPeerId === peer.id;
          if (peer.id === selfPeerId) {
            // Same row shape as its neighbours, minus every interactive part:
            // the organizer's share is context, not a debt anyone can settle.
            return (
              <li key={peer.id} className="flex items-center gap-2 py-1">
                <div className="flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left">
                  <span>{peerName.get(peer.id)}</span>
                  <span className="rounded-full bg-surface-tint px-2 py-0.5 text-xs font-semibold text-primary-ink">
                    เจ้าของบิล
                  </span>
                  {absorbsLeftover && result.billLeftover && (
                    <RoundingDiscountNote leftoverSatang={result.billLeftover.leftoverSatang} />
                  )}
                  <span className="ml-auto font-semibold tabular-nums">
                    {formatSatang(peerTotal)}
                  </span>
                </div>
                {/* Fixed-width, invisible clone of the trailing status slot below
                    (STATUS_SLOT_CLS) — every row variant (this clone, the claimed
                    row's status span, the unclaimed row's pay button) shares that
                    same width, so the total's horizontal position never shifts
                    depending on which status string a given row happens to show. */}
                <span aria-hidden className={`invisible ${STATUS_SLOT_CLS}`}>
                  ✓ จ่ายแล้ว
                </span>
              </li>
            );
          }
          const breakdown = result.peerBreakdowns[peer.id];
          return (
            <li key={peer.id} className="flex flex-col gap-1 py-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => claim(peer.id)}
                  className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition active:scale-[0.99] ${
                    isClaimed ? "bg-surface-tint" : "hover:bg-surface-tint"
                  }`}
                >
                  <span className={paid[peer.id] ? "text-ink-muted" : ""}>
                    {peerName.get(peer.id)}
                  </span>
                  {isClaimed && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
                      คุณ
                    </span>
                  )}
                  {absorbsLeftover && result.billLeftover && (
                    <RoundingDiscountNote leftoverSatang={result.billLeftover.leftoverSatang} />
                  )}
                  <span className="ml-auto font-semibold tabular-nums">
                    {formatSatang(peerTotal)}
                  </span>
                </button>
                {isClaimed ? (
                  // Claimed peer's pay control lives in the top panel; here we only
                  // echo status, and only when there is actually something to pay.
                  // Same fixed-width slot as the button below, so this row's total
                  // still lines up with every other row even with no pay control.
                  (paid[peer.id] || peerTotal > 0) ? (
                    <span
                      className={`${STATUS_SLOT_CLS} ${
                        paid[peer.id] ? "text-success" : "text-ink-muted"
                      }`}
                    >
                      {paid[peer.id] ? "✓ จ่ายแล้ว" : "จ่ายด้านบน"}
                    </span>
                  ) : (
                    <span aria-hidden className={`invisible ${STATUS_SLOT_CLS}`}>
                      ✓ จ่ายแล้ว
                    </span>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onPaid(peer.id)}
                    className={`${STATUS_SLOT_CLS} transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                      paid[peer.id]
                        ? "bg-success text-white hover:opacity-90"
                        : "border border-border text-ink-muted hover:bg-surface-tint"
                    }`}
                  >
                    {paid[peer.id] ? "✓ จ่ายแล้ว" : "ยังไม่จ่าย"}
                  </button>
                )}
              </div>
              {isClaimed && breakdown && (
                <div className="mt-1 flex flex-col gap-0.5 border-t border-dashed border-border pt-1 text-xs text-ink-muted">
                  <div className="flex justify-between">
                    <span>รวมของคุณ</span>
                    <b className="text-ink">{formatSatang(breakdown.subtotalSatang)}</b>
                  </div>
                  {breakdown.serviceChargeSatang > 0 && (
                    <div className="flex justify-between">
                      <span>+ Service charge</span>
                      <b className="text-ink">{formatSatang(breakdown.serviceChargeSatang)}</b>
                    </div>
                  )}
                  {breakdown.vatSatang > 0 && (
                    <div className="flex justify-between">
                      <span>+ VAT</span>
                      <b className="text-ink">{formatSatang(breakdown.vatSatang)}</b>
                    </div>
                  )}
                  {result.purchase && (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      แปลงจาก{" "}
                      {formatMinorUnits(result.purchase.peerTotals[peer.id] ?? 0, result.purchase.currency)}{" "}
                      &middot; อัตรา 1 {result.purchase.currency} = ฿
                      {(result.purchase.rateNumerator / result.purchase.rateDenominator).toString()}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );

  const chipListView = locked ? (
    <>
      {everyoneSection}
      {itemsSection}
    </>
  ) : (
    <>
      {itemsSection}
      {everyoneSection}
    </>
  );

  const matrixView = (
    <section className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 min-w-[160px] bg-surface p-3 text-left font-semibold">
              รายการ
              <span className="block text-xs font-normal text-ink-muted">
                แตะชื่อคุณเพื่อรับ QR
              </span>
            </th>
            {peersSorted.map((peer) => {
              const isClaimed = claimedId === peer.id;
              const absorbsLeftover = result.billLeftover?.absorberPeerId === peer.id;
              if (peer.id === selfPeerId) {
                // A plain span, not a disabled button: nothing here is tappable,
                // so nothing here should look tappable.
                return (
                  <th key={peer.id} className="p-2 text-center font-semibold">
                    <span className="inline-flex min-h-9 flex-col items-center justify-center rounded-lg px-2 py-1 text-ink-muted">
                      {peer.name}
                      <span className="text-[11px] font-normal">เจ้าของบิล</span>
                      {absorbsLeftover && result.billLeftover && (
                        <RoundingDiscountNote leftoverSatang={result.billLeftover.leftoverSatang} />
                      )}
                    </span>
                  </th>
                );
              }
              return (
                <th key={peer.id} className="p-2 text-center font-semibold">
                  <button
                    type="button"
                    onClick={() => claim(peer.id)}
                    className={`inline-flex min-h-9 flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 transition active:scale-95 ${
                      isClaimed
                        ? "bg-primary text-white"
                        : "text-ink-muted hover:bg-surface-tint hover:text-ink"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {peer.name}
                      {isClaimed && (
                        <span className="inline-flex items-center justify-center rounded-full bg-white/25 px-1.5 text-[11px] leading-5 font-semibold">
                          คุณ
                        </span>
                      )}
                    </span>
                    {absorbsLeftover && result.billLeftover && (
                      <RoundingDiscountNote
                        leftoverSatang={result.billLeftover.leftoverSatang}
                        inverted={isClaimed}
                      />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {displayItems.map((item) => {
            const share = itemShareSatang(item);
            const itemTotal = itemTotalSatang(item);
            return (
              <tr key={item.id} className="border-b border-border">
                <td className="sticky left-0 z-10 min-w-[160px] bg-surface p-3">
                  <span className="block font-medium">{item.name || "ไม่มีชื่อเมนู"}</span>
                  <span className="block text-xs tabular-nums text-ink-muted">
                    {bill.bill.purchaseCurrency
                      ? formatMinorUnits(itemTotal, bill.bill.purchaseCurrency)
                      : formatSatang(itemTotal)}
                    {/* #38: the currency already shows on the total above -- repeating it
                        here too was what forced this column to wrap line-by-line with a
                        multi-character code. */}
                    {share !== null && ` · ${formatAmount(share)}/คน`}
                  </span>
                </td>
                {peersSorted.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  return (
                    <td key={peer.id} className="p-1 text-center">
                      <button
                        type="button"
                        disabled={locked || pending}
                        onClick={() => onTick(item.id, peer.id)}
                        aria-label={`${peer.name} — ${item.name || "ไม่มีชื่อเมนู"}`}
                        className={`h-10 w-10 rounded-lg border text-lg font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
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
            <tr className="border-b border-border/60 text-ink-muted">
              <td className="sticky left-0 bg-surface p-3">ส่วนลด</td>
              {peersSorted.map((peer) => (
                <td key={peer.id} className="p-2 text-center text-xs tabular-nums">
                  −{formatSatang(result.peerBreakdowns[peer.id]?.discountSatang ?? 0)}
                </td>
              ))}
            </tr>
          )}
          <tr className="border-b border-border/60 text-ink-muted">
            <td className="sticky left-0 bg-surface p-3">รวมเป็นเงิน</td>
            {peersSorted.map((peer) => (
              <td key={peer.id} className="p-2 text-center text-xs tabular-nums">
                {formatSatang(result.peerBreakdowns[peer.id]?.subtotalSatang ?? 0)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border/60 text-ink-muted">
            <td className="sticky left-0 bg-surface p-3">Service charge</td>
            {peersSorted.map((peer) => (
              <td key={peer.id} className="p-2 text-center text-xs tabular-nums">
                {formatSatang(result.peerBreakdowns[peer.id]?.serviceChargeSatang ?? 0)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border/60 text-ink-muted">
            <td className="sticky left-0 bg-surface p-3">VAT</td>
            {peersSorted.map((peer) => (
              <td key={peer.id} className="p-2 text-center text-xs tabular-nums">
                {/* ADR-0011 known limitation: the negative-remainder guard can make a
                    non-absorber's displayed VAT residual negative even though their real
                    total never does. Clamp the display only, not the underlying math. */}
                {formatSatang(Math.max(0, result.peerBreakdowns[peer.id]?.vatSatang ?? 0))}
              </td>
            ))}
          </tr>
          <tr className="border-b border-border">
            <td className="sticky left-0 bg-surface p-3 font-semibold">ยอดต่อคน</td>
            {peersSorted.map((peer) => (
              <td key={peer.id} className="p-2 text-center font-semibold tabular-nums">
                {formatSatang(result.peerTotals[peer.id] ?? 0)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="sticky left-0 bg-surface p-3 font-semibold">จ่ายแล้ว</td>
            {peersSorted.map((peer) =>
              peer.id === selfPeerId ? (
                // No Paid Flag on the organizer's own column: there is nothing
                // to settle. The empty box keeps the row height of its neighbours.
                <td key={peer.id} className="p-1 text-center">
                  <span className="inline-flex h-10 w-10 items-center justify-center">
                    {/* Carries the meaning to a screen reader, which would
                        otherwise hit one silent column in a row of buttons. */}
                    <span className="sr-only">ไม่ต้องจ่าย</span>
                  </span>
                </td>
              ) : (
                <td key={peer.id} className="p-1 text-center">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onPaid(peer.id)}
                    aria-label={`${peer.name} จ่ายแล้ว`}
                    className={`h-10 w-10 rounded-lg border text-lg font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
                      paid[peer.id]
                        ? "border-transparent bg-success text-white hover:opacity-90"
                        : "border-border bg-surface text-ink-muted/40 hover:border-primary hover:bg-surface-tint"
                    }`}
                  >
                    ✓
                  </button>
                </td>
              ),
            )}
          </tr>
        </tfoot>
      </table>
    </section>
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{bill.bill.restaurant || "บิลมื้อนี้"}</h1>
          <p className="text-sm text-ink-muted">{dateFormat.format(new Date(bill.bill.eatenAt))}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              locked ? "bg-ink text-white" : "bg-surface-tint text-primary-ink"
            }`}
          >
            {locked ? "💰 พร้อมเก็บเงิน" : "✓ เปิดแล้ว"}
          </span>
          {isOwner && (
            <div className="flex items-center gap-2">
              <Link
                href={`/bills/${billId}`}
                className="flex min-h-10 items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-primary-ink transition hover:border-primary hover:bg-surface-tint active:scale-95"
              >
                แก้ไขบิล
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={onLockToggle}
                className="min-h-10 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {locked ? "ปลดล็อกรายการ" : "ล็อกรายการ"}
              </button>
            </div>
          )}
        </div>
      </header>

      {bill.bill.purchaseCurrency && (
        <p className="rounded-xl bg-surface-tint p-3 text-sm font-medium text-primary-ink">
          บิลนี้จ่ายเป็น {bill.bill.purchaseCurrency} &middot; แปลงเป็นบาทด้วยอัตรา 1{" "}
          {bill.bill.purchaseCurrency} = ฿
          {((bill.bill.fxRateNumerator ?? 1) / (bill.bill.fxRateDenominator ?? 1)).toString()}
        </p>
      )}

      {locked && (
        <p className="rounded-xl bg-surface-tint p-3 text-sm text-primary-ink">
          สรุปยอดแล้ว บิลพร้อมเก็บเงิน กด &quot;จ่ายแล้ว&quot; ได้เลย
        </p>
      )}

      {/* #38: matrix/cards sit left and the payback panel sits right at lg:, but the
          payback panel must stay FIRST in the DOM below lg: (today's stacked order,
          unchanged) — a plain block div stacks children in source order regardless of
          the lg:grid classes, so the desktop reorder is done with lg:order-* instead of
          moving paybackPanel later in the JSX. */}
      {/* minmax(0, ...) on both tracks, not bare fr units: a bare fr track's min-width
          defaults to auto (its content's min-content size), so with enough peers the
          matrix's own overflow-x-auto never engages -- the grid track just grows past
          max-w-5xl instead. minmax(0, ...) clamps the track so the table scrolls inside
          it, and the page width stays fixed regardless of peer count. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="lg:order-2">{paybackPanel}</div>
        <div className="mt-4 flex flex-col gap-4 lg:order-1 lg:mt-0">
          <div className="hidden lg:block">{matrixView}</div>
          <div className="lg:hidden">{chipListView}</div>
        </div>
      </div>

      <p className="text-right text-sm font-semibold tabular-nums">
        รวมทั้งบิล {formatSatang(result.checksumSatang)}
      </p>
    </main>
  );
}
