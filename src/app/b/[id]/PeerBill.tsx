"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeBill } from "@/lib/billing/compute";
import { itemShareSatang, itemTotalSatang } from "@/lib/billing/itemShare";
import { formatSatang } from "@/lib/billing/money";
import type { BillInput } from "@/lib/billing/types";
import { fetchBill, type GetBillJson } from "@/lib/bills/getBill";
import { setBillStatus } from "@/lib/bills/mutations";
import { setPaid as setPaidRpc, setTick as setTickRpc, subscribeBillChanged } from "@/lib/bills/peer";
import { createClient } from "@/lib/supabase/client";

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "long" });

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

  const refetch = useCallback(async () => {
    const json = await fetchBill(createClient(), billId);
    if (json) setBill(json);
    // null (draft/deleted mid-session) keeps the last known state on screen.
  }, [billId]);

  useEffect(() => subscribeBillChanged(billId, () => void refetch()), [billId, refetch]);

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

  const billInput: BillInput = useMemo(
    () => ({
      items: displayItems,
      peerIds: bill.peers.map((peer) => peer.id),
      billDiscount: {
        percent: bill.bill.billDiscountPercent,
        amountSatang: bill.bill.billDiscountSatang,
      },
      serviceChargePercent: bill.bill.serviceChargePercent,
      vatPercent: bill.bill.vatPercent,
    }),
    [displayItems, bill.peers, bill.bill],
  );

  const result = useMemo(() => computeBill(billInput), [billInput]);
  const locked = bill.bill.status === "locked";
  const peerName = new Map(bill.peers.map((peer) => [peer.id, peer.name]));

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
    const wasPaid = bill.peers.find((peer) => peer.id === peerId)?.paidAt != null;
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
    } finally {
      setPending(false);
      await refetch();
    }
  }

  const paid: Record<string, boolean> = {};
  for (const peer of bill.peers) paid[peer.id] = peer.paidAt != null;

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
                <span className="tabular-nums text-ink-muted">{formatSatang(itemTotal)}</span>
              </div>
              <p className="text-xs text-ink-muted">
                {share === null
                  ? "ยังไม่มีคนติ๊ก"
                  : `${formatSatang(share)} / คน × ${item.tickedBy.length}`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {bill.peers.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  return (
                    <button
                      key={peer.id}
                      type="button"
                      disabled={locked || pending}
                      onClick={() => onTick(item.id, peer.id)}
                      className={`min-h-10 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                        ticked ? "bg-primary text-white" : "bg-surface-tint text-ink"
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
      <h2 className="mb-2 font-semibold">ทุกคน</h2>
      <ul className="flex flex-col divide-y divide-border">
        {bill.peers.map((peer) => (
          <li key={peer.id} className="flex items-center justify-between gap-3 py-2">
            <span className={paid[peer.id] ? "text-ink-muted" : ""}>{peerName.get(peer.id)}</span>
            <span className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">
                {formatSatang(result.peerTotals[peer.id] ?? 0)}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPaid(peer.id)}
                className={`min-h-10 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${
                  paid[peer.id]
                    ? "bg-success text-white"
                    : "border border-border text-ink-muted"
                }`}
              >
                {paid[peer.id] ? "✓ จ่ายแล้ว" : "ยังไม่จ่าย"}
              </button>
            </span>
          </li>
        ))}
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
            <th className="sticky left-0 bg-surface p-3 text-left font-semibold">รายการ</th>
            {bill.peers.map((peer) => (
              <th key={peer.id} className="p-2 text-center font-semibold">
                {peer.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayItems.map((item) => {
            const share = itemShareSatang(item);
            const itemTotal = itemTotalSatang(item);
            return (
              <tr key={item.id} className="border-b border-border">
                <td className="sticky left-0 bg-surface p-3">
                  <span className="block font-medium">{item.name || "ไม่มีชื่อเมนู"}</span>
                  <span className="block text-xs tabular-nums text-ink-muted">
                    {formatSatang(itemTotal)}
                    {share !== null && ` · ${formatSatang(share)}/คน`}
                  </span>
                </td>
                {bill.peers.map((peer) => {
                  const ticked = item.tickedBy.includes(peer.id);
                  return (
                    <td key={peer.id} className="p-1 text-center">
                      <button
                        type="button"
                        disabled={locked || pending}
                        onClick={() => onTick(item.id, peer.id)}
                        aria-label={`${peer.name} — ${item.name || "ไม่มีชื่อเมนู"}`}
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
            {bill.peers.map((peer) => (
              <td key={peer.id} className="p-2 text-center font-semibold tabular-nums">
                {formatSatang(result.peerTotals[peer.id] ?? 0)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="sticky left-0 bg-surface p-3 font-semibold">จ่ายแล้ว</td>
            {bill.peers.map((peer) => (
              <td key={peer.id} className="p-1 text-center">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onPaid(peer.id)}
                  aria-label={`${peer.name} จ่ายแล้ว`}
                  className={`h-10 w-10 rounded-lg text-lg font-bold disabled:opacity-50 ${
                    paid[peer.id] ? "bg-success text-white" : "bg-surface-tint text-transparent"
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-10">
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
            {locked ? "ล็อกแล้ว" : "เปิดอยู่"}
          </span>
          {isOwner && (
            <button
              type="button"
              disabled={pending}
              onClick={onLockToggle}
              className="min-h-10 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-deep disabled:opacity-50"
            >
              {locked ? "ปลดล็อกบิล" : "ล็อกบิล"}
            </button>
          )}
        </div>
      </header>

      {locked && (
        <p className="rounded-xl bg-surface-tint p-3 text-sm text-primary-ink">
          บิลถูกล็อกแล้ว ยอดเป็นอันสุดท้าย — ติ๊กรายการไม่ได้ แต่ยังกด &quot;จ่ายแล้ว&quot; ได้
        </p>
      )}

      <div className="hidden lg:block">{matrixView}</div>
      <div className="lg:hidden">{chipListView}</div>

      <p className="text-right text-sm font-semibold tabular-nums">
        รวมทั้งบิล {formatSatang(result.checksumSatang)}
      </p>

      {bill.bill.paymentInfo && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 font-semibold">โอนคืนที่</h2>
          <p className="text-sm">
            {bill.bill.paymentMethod && (
              <span className="font-medium">{bill.bill.paymentMethod} · </span>
            )}
            {bill.bill.paymentInfo}
          </p>
        </section>
      )}
    </main>
  );
}
