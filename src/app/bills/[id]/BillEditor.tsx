"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeBill } from "@/lib/billing/compute";
import { formatSatang } from "@/lib/billing/money";
import { mapToBillInput } from "@/lib/bills/mapper";
import {
  addLineItem,
  addPeerToBill,
  deleteLineItem,
  publishBill,
  removePeerFromBill,
  toggleTick,
  updateBill,
  updateLineItem,
} from "@/lib/bills/mutations";
import type { BillRow, LineItemRow, PeerRow, TickRow } from "@/lib/bills/types";
import PeerPicker from "./PeerPicker";
import MatrixView from "./MatrixView";
import CardsView from "./CardsView";

export const inputCls =
  "rounded-lg border border-border bg-surface p-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary-ink";

export function satangToInput(satang: number): string {
  return satang === 0 ? "" : (satang / 100).toFixed(2);
}
export function inputToSatang(text: string): number {
  const value = Number(text.replace(/,/g, "").trim());
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}
function inputToPercent(text: string): number {
  const value = parseInt(text, 10);
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Autosave failed → resync from the DB (Supabase is the source of truth). */
function onSaveError(error: unknown) {
  alert(`บันทึกไม่สำเร็จ กำลังโหลดข้อมูลใหม่\n${error instanceof Error ? error.message : ""}`);
  window.location.reload();
}

interface Props {
  initialBill: BillRow;
  initialItems: LineItemRow[];
  initialPeers: PeerRow[];
  initialTicks: TickRow[];
  recentPeers: PeerRow[];
}

export default function BillEditor({
  initialBill,
  initialItems,
  initialPeers,
  initialTicks,
  recentPeers,
}: Props) {
  const [bill, setBill] = useState(initialBill);
  const [items, setItems] = useState(initialItems);
  const [peers, setPeers] = useState(initialPeers);
  const [ticks, setTicks] = useState(initialTicks);
  const [copied, setCopied] = useState(false);

  const result = useMemo(
    () => computeBill(mapToBillInput(bill, items, peers, ticks)),
    [bill, items, peers, ticks],
  );

  function saveBill(patch: Partial<BillRow>) {
    setBill((prev) => ({ ...prev, ...patch }));
    updateBill(bill.id, patch).catch(onSaveError);
  }

  async function onAddItem() {
    const position = items.reduce((max, item) => Math.max(max, item.position), 0) + 1;
    try {
      const row = await addLineItem(bill.id, position);
      setItems((prev) => [...prev, row]);
    } catch (error) {
      onSaveError(error);
    }
  }

  function onUpdateItem(itemId: string, patch: Partial<LineItemRow>) {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
    updateLineItem(itemId, patch).catch(onSaveError);
  }

  function onRemoveItem(itemId: string) {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setTicks((prev) => prev.filter((tick) => tick.line_item_id !== itemId));
    deleteLineItem(itemId).catch(onSaveError); // ticks cascade in the DB
  }

  async function onAddPeer(name: string) {
    try {
      const peer = await addPeerToBill(bill.id, name);
      setPeers((prev) => (prev.some((p) => p.id === peer.id) ? prev : [...prev, peer]));
    } catch (error) {
      onSaveError(error);
    }
  }

  function onRemovePeer(peerId: string) {
    setPeers((prev) => prev.filter((peer) => peer.id !== peerId));
    setTicks((prev) => prev.filter((tick) => tick.peer_id !== peerId));
    removePeerFromBill(bill.id, peerId, items.map((item) => item.id)).catch(onSaveError);
  }

  function onToggle(lineItemId: string, peerId: string) {
    const ticked = ticks.some(
      (tick) => tick.line_item_id === lineItemId && tick.peer_id === peerId,
    );
    setTicks((prev) =>
      ticked
        ? prev.filter(
            (tick) => !(tick.line_item_id === lineItemId && tick.peer_id === peerId),
          )
        : [...prev, { line_item_id: lineItemId, peer_id: peerId }],
    );
    toggleTick(lineItemId, peerId, !ticked).catch(onSaveError);
  }

  function onPublish() {
    setBill((prev) => ({ ...prev, status: "open" }));
    publishBill(bill.id).catch(onSaveError);
  }

  async function onCopyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/b/${bill.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-44 lg:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/dashboard" className="text-sm text-primary-ink underline">
          ← บิลทั้งหมด
        </Link>
        {bill.status === "draft" ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={items.length === 0}
            className="rounded-xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-deep disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
            title={items.length === 0 ? "เพิ่มรายการอาหารก่อนเปิดบิล" : undefined}
          >
            เปิดบิล · Publish
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-success px-3 py-1 text-sm font-bold text-white">
              เปิดแล้ว
            </span>
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-primary-ink hover:border-primary focus-visible:outline-2 focus-visible:outline-primary-ink"
            >
              {copied ? "คัดลอกลิงก์แล้ว ✓" : "คัดลอกลิงก์"}
            </button>
          </div>
        )}
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-muted">
          ชื่อร้าน
          <input
            defaultValue={bill.restaurant}
            placeholder="ร้านอะไรเอ่ย"
            onBlur={(e) => {
              if (e.target.value !== bill.restaurant) saveBill({ restaurant: e.target.value });
            }}
            className={`${inputCls} text-base font-medium`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          วันที่
          <input
            type="date"
            defaultValue={bill.eaten_at}
            onBlur={(e) => {
              if (e.target.value && e.target.value !== bill.eaten_at)
                saveBill({ eaten_at: e.target.value });
            }}
            className={inputCls}
          />
        </label>
      </section>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ส่วนลดบิล %
          <input
            inputMode="numeric"
            defaultValue={bill.bill_discount_percent || ""}
            onBlur={(e) => saveBill({ bill_discount_percent: inputToPercent(e.target.value) })}
            className={`${inputCls} w-16 text-right tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ส่วนลดบิล ฿
          <input
            inputMode="decimal"
            defaultValue={satangToInput(bill.bill_discount_satang)}
            onBlur={(e) => saveBill({ bill_discount_satang: inputToSatang(e.target.value) })}
            className={`${inputCls} w-24 text-right tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Service charge %
          <input
            inputMode="numeric"
            defaultValue={bill.service_charge_percent || ""}
            onBlur={(e) => saveBill({ service_charge_percent: inputToPercent(e.target.value) })}
            className={`${inputCls} w-16 text-right tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          VAT %
          <input
            inputMode="numeric"
            defaultValue={bill.vat_percent || ""}
            onBlur={(e) => saveBill({ vat_percent: inputToPercent(e.target.value) })}
            className={`${inputCls} w-16 text-right tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ยอดตามใบเสร็จ ฿
          <input
            inputMode="decimal"
            defaultValue={satangToInput(bill.receipt_total_satang)}
            onBlur={(e) => saveBill({ receipt_total_satang: inputToSatang(e.target.value) })}
            className={`${inputCls} w-28 text-right tabular-nums`}
          />
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-muted">
          ช่องทางรับเงิน (พร้อมเพย์)
          <input
            defaultValue={bill.payment_info}
            placeholder="เบอร์พร้อมเพย์ / เลขบัญชี"
            onBlur={(e) => {
              if (e.target.value !== bill.payment_info)
                saveBill({ payment_info: e.target.value });
            }}
            className={inputCls}
          />
        </label>
      </section>

      <PeerPicker
        peersOnBill={peers}
        recentPeers={recentPeers}
        onAdd={onAddPeer}
        onRemove={onRemovePeer}
      />

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">รายการอาหาร</h2>
        {items.length === 0 && (
          <p className="text-sm text-ink-muted">ยังไม่มีรายการ — เพิ่มเมนูจากใบเสร็จได้เลย</p>
        )}
        {items.map((item) => (
          <ItemRow key={item.id} item={item} onUpdate={onUpdateItem} onRemove={onRemoveItem} />
        ))}
        <button
          type="button"
          onClick={onAddItem}
          className="mt-1 self-start rounded-lg border border-border bg-surface-tint px-4 py-2.5 text-sm font-medium text-primary-ink hover:border-primary focus-visible:outline-2 focus-visible:outline-primary-ink"
        >
          + เพิ่มเมนู
        </button>
      </section>

      <div className="hidden lg:block">
        <MatrixView
          items={items}
          peers={peers}
          ticks={ticks}
          result={result}
          receiptTotalSatang={bill.receipt_total_satang}
          onToggle={onToggle}
        />
      </div>
      <div className="lg:hidden">
        <CardsView
          items={items}
          peers={peers}
          ticks={ticks}
          result={result}
          receiptTotalSatang={bill.receipt_total_satang}
          onToggle={onToggle}
        />
      </div>
    </main>
  );
}

function ItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: LineItemRow;
  onUpdate: (id: string, patch: Partial<LineItemRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-ink-muted">
        เมนู
        <input
          defaultValue={item.name}
          placeholder="ชื่อเมนู"
          onBlur={(e) => {
            if (e.target.value !== item.name) onUpdate(item.id, { name: e.target.value });
          }}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        ราคา ฿
        <input
          inputMode="decimal"
          defaultValue={satangToInput(item.unit_price_satang)}
          onBlur={(e) => onUpdate(item.id, { unit_price_satang: inputToSatang(e.target.value) })}
          className={`${inputCls} w-24 text-right tabular-nums`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        จำนวน
        <input
          inputMode="numeric"
          defaultValue={item.qty}
          onBlur={(e) => {
            const qty = parseInt(e.target.value, 10);
            onUpdate(item.id, { qty: Number.isNaN(qty) || qty < 1 ? 1 : qty });
          }}
          className={`${inputCls} w-14 text-right tabular-nums`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        ลด %
        <input
          inputMode="numeric"
          defaultValue={item.discount_percent || ""}
          onBlur={(e) => {
            const value = parseInt(e.target.value, 10);
            onUpdate(item.id, {
              discount_percent: Number.isNaN(value) ? 0 : Math.min(100, Math.max(0, value)),
            });
          }}
          className={`${inputCls} w-14 text-right tabular-nums`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-muted">
        ลด ฿
        <input
          inputMode="decimal"
          defaultValue={satangToInput(item.discount_satang)}
          onBlur={(e) => onUpdate(item.id, { discount_satang: inputToSatang(e.target.value) })}
          className={`${inputCls} w-20 text-right tabular-nums`}
        />
      </label>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`ลบ ${item.name || "รายการ"}`}
        className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-lg text-danger hover:bg-surface-tint focus-visible:outline-2 focus-visible:outline-danger"
      >
        ✕
      </button>
    </div>
  );
}

export function receiptStatus(receiptTotalSatang: number, checksumSatang: number) {
  if (receiptTotalSatang === 0) return { matches: false, label: "ยังไม่ได้กรอกยอดใบเสร็จ" };
  if (receiptTotalSatang === checksumSatang) return { matches: true, label: "✓ ตรงกับใบเสร็จ" };
  return {
    matches: false,
    label: `✗ ต่างจากใบเสร็จ ${formatSatang(Math.abs(checksumSatang - receiptTotalSatang))}`,
  };
}
