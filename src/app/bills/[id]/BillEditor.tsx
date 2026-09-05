"use client";

import { useMemo, useRef, useState, type FocusEvent, type FormEvent, type Ref } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import KebabMenu, { kebabItemCls } from "@/components/KebabMenu";
import { computeBill } from "@/lib/billing/compute";
import { totalFromUnitPriceSatang, unitPriceFromTotalSatang } from "@/lib/billing/lineEntry";
import { formatMinorUnits, formatSatang } from "@/lib/billing/money";
import { mapToBillInput } from "@/lib/bills/mapper";
import {
  addLineItem,
  addPeerToBill,
  deleteBill,
  deleteLineItem,
  publishBill,
  removePeerFromBill,
  toggleTick,
  updateBill,
  updateLineItem,
} from "@/lib/bills/mutations";
import type {
  BillRow,
  LineItemRow,
  PeerRow,
  ProfileRow,
  TickRow,
} from "@/lib/bills/types";
import PeerPicker from "./PeerPicker";
import MatrixView from "./MatrixView";
import CardsView from "./CardsView";

export const inputCls =
  "min-h-11 rounded-lg border border-border bg-surface p-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary-ink";

const chipCls =
  "rounded-md border border-border bg-surface-tint px-2 py-1 text-xs font-medium text-primary-ink transition hover:border-primary hover:bg-border active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink";

/** A percent `<input>` with a permanent, always-visible "%" suffix (not a placeholder). */
function PercentBox({
  defaultValue,
  onBlur,
  widthCls = "w-full",
}: {
  defaultValue: number | string;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
  widthCls?: string;
}) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        defaultValue={defaultValue}
        placeholder="0"
        onBlur={onBlur}
        className={`${inputCls} ${widthCls} pr-6 text-right tabular-nums`}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-ink-muted">
        %
      </span>
    </div>
  );
}

/**
 * #38: a money `<input>` with a permanent, always-visible currency prefix (not a placeholder,
 * not a parenthetical in the label) — mirrors PercentBox's suffix, just on the leading edge.
 * `inputRef` (not `ref`) so ItemRow can keep forwarding priceRef/totalRef for its imperative
 * cross-field writes.
 */
function MoneyBox({
  inputRef,
  defaultValue,
  symbol,
  onInput,
  onBlur,
  widthCls = "w-24",
}: {
  inputRef?: Ref<HTMLInputElement>;
  defaultValue: string;
  symbol: string;
  onInput?: (e: FormEvent<HTMLInputElement>) => void;
  onBlur: (e: FocusEvent<HTMLInputElement>) => void;
  widthCls?: string;
}) {
  // A fixed pl-9 fit "฿" (one glyph) but overflowed into the digits for a longer code like
  // "TWD" — scale the reserved space with the symbol's own length instead of a flat class.
  const paddingLeftPx = symbol.length * 8 + 20;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-ink-muted">
        {symbol}
      </span>
      <input
        ref={inputRef}
        inputMode="decimal"
        defaultValue={defaultValue}
        placeholder="0.00"
        onInput={onInput}
        onBlur={onBlur}
        style={{ paddingLeft: `${paddingLeftPx}px` }}
        className={`${inputCls} ${widthCls} text-right tabular-nums`}
      />
    </div>
  );
}

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

/** Money fields normalize to 2 decimals on blur (100 → 100.00). */
function moneyBlur(
  e: FocusEvent<HTMLInputElement>,
  save: (satang: number) => void,
) {
  const satang = inputToSatang(e.target.value);
  e.target.value = satangToInput(satang);
  save(satang);
}

/** #38: render the stored numerator/denominator fraction as a plain decimal string. */
function fxRateToInput(numerator: number | null, denominator: number | null): string {
  if (numerator === null || denominator === null || denominator === 0) return "";
  return String(numerator / denominator);
}

/** #38: parse a typed decimal rate (e.g. "1.15") into an exact integer fraction. */
function rateBlur(
  e: FocusEvent<HTMLInputElement>,
  cb: (numerator: number, denominator: number) => void,
): void {
  const raw = e.target.value.trim();
  if (raw === "") return;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return;
  const [, whole, frac = ""] = match;
  const numerator = Number(whole + frac);
  const denominator = 10 ** frac.length;
  if (numerator <= 0) return;
  cb(numerator, denominator);
}

interface SaveError {
  message: string;
  retry: () => void;
}

interface Props {
  initialBill: BillRow;
  initialItems: LineItemRow[];
  initialPeers: PeerRow[];
  initialTicks: TickRow[];
  recentPeers: PeerRow[];
  /** ADR-0010: the organizer's own peer row on this bill, badged คุณ. */
  selfPeerId: string | null;
  profile: ProfileRow;
}

export default function BillEditor({
  initialBill,
  initialItems,
  initialPeers,
  initialTicks,
  recentPeers,
  selfPeerId,
  profile,
}: Props) {
  const router = useRouter();
  const [bill, setBill] = useState(initialBill);
  const [items, setItems] = useState(initialItems);
  const [peers, setPeers] = useState(initialPeers);
  const [ticks, setTicks] = useState(initialTicks);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // "Follow profile" only makes sense once the profile has something to follow.
  // An empty profile disables the toggle entirely — otherwise ticking it would
  // silently wipe the bill's payment info (and every peer's QR) with blanks.
  const profileEmpty =
    !profile.promptpay_id &&
    !profile.bank_name &&
    !profile.bank_account &&
    !profile.account_name;
  // Starts on when the bill's payment matches a non-empty profile (a fresh bill
  // is snapshotted at creation); a per-bill override reads as off so its custom
  // values stay editable.
  const [followProfile, setFollowProfile] = useState(
    !profileEmpty &&
      initialBill.promptpay_id === profile.promptpay_id &&
      initialBill.bank_name === profile.bank_name &&
      initialBill.bank_account === profile.bank_account &&
      initialBill.account_name === profile.account_name,
  );

  function toggleFollowProfile(checked: boolean) {
    setFollowProfile(checked);
    if (checked) {
      // Snapshot the profile's four values onto this bill.
      saveBill({
        promptpay_id: profile.promptpay_id,
        bank_name: profile.bank_name,
        bank_account: profile.bank_account,
        account_name: profile.account_name,
      });
    }
  }

  const result = useMemo(
    () => computeBill(mapToBillInput(bill, items, peers, ticks, selfPeerId)),
    [bill, items, peers, ticks, selfPeerId],
  );
  // #38: the "matches the paper receipt" block reads Purchase-scale figures (same shape as the
  // THB ones by design — see PurchaseSideResult), formatted in that currency, not ฿.
  const checkFigures = result.purchase ?? result;
  const formatCheck = (amountMinor: number) =>
    bill.purchase_currency ? formatMinorUnits(amountMinor, bill.purchase_currency) : formatSatang(amountMinor);
  // #38: ยอดตามใบเสร็จ is always the Purchase Currency figure (what's on the paper receipt) —
  // check it against the Purchase-scale checksum, not the THB one, or a TWD receipt total
  // would be compared against a baht sum and never tie. The mismatch label must format in
  // that same currency too — it used to hardcode ฿ even when both operands were TWD.
  const receipt = receiptStatus(
    bill.receipt_total_satang,
    result.purchase ? result.purchase.checksumSatang : result.checksumSatang,
    formatCheck,
  );

  /**
   * Autosave failed → surface an inline banner instead of forcing a reload.
   * Clearing saveError at the start of every attempt (not just on success)
   * stops a stale "retry" from a superseded failure firing after a newer
   * edit already saved successfully.
   */
  function runMutation(action: () => Promise<void>) {
    setSaveError(null);
    action()
      .then(() => setSaved(true))
      .catch((error: unknown) => {
        setSaveError({
          message: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
          retry: () => runMutation(action),
        });
      });
  }

  function saveBill(patch: Partial<BillRow>) {
    setBill((prev) => ({ ...prev, ...patch }));
    runMutation(() => updateBill(bill.id, patch));
  }

  async function onAddItem() {
    setSaveError(null);
    const position = items.reduce((max, item) => Math.max(max, item.position), 0) + 1;
    try {
      const row = await addLineItem(bill.id, position);
      setItems((prev) => [...prev, row]);
      setSaved(true);
    } catch (error) {
      setSaveError({
        message: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
        retry: onAddItem,
      });
    }
  }

  function onUpdateItem(itemId: string, patch: Partial<LineItemRow>) {
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
    runMutation(() => updateLineItem(itemId, patch));
  }

  /** ADR-0011: organizer picks which peer absorbs the bill-wide rounding leftover. */
  function onUpdateBillAbsorber(peerId: string) {
    saveBill({ rounding_absorber_peer_id: peerId });
  }

  function onRemoveItem(itemId: string) {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setTicks((prev) => prev.filter((tick) => tick.line_item_id !== itemId));
    runMutation(() => deleteLineItem(itemId)); // ticks cascade in the DB
  }

  async function onAddPeer(name: string) {
    setSaveError(null);
    try {
      const peer = await addPeerToBill(bill.id, name);
      setPeers((prev) => (prev.some((p) => p.id === peer.id) ? prev : [...prev, peer]));
      setSaved(true);
    } catch (error) {
      setSaveError({
        message: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
        retry: () => onAddPeer(name),
      });
    }
  }

  function onRemovePeer(peerId: string) {
    setPeers((prev) => prev.filter((peer) => peer.id !== peerId));
    setTicks((prev) => prev.filter((tick) => tick.peer_id !== peerId));
    const itemIds = items.map((item) => item.id);
    runMutation(() => removePeerFromBill(bill.id, peerId, itemIds));
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
    runMutation(() => toggleTick(lineItemId, peerId, !ticked));
  }

  function onPublish() {
    setBill((prev) => ({ ...prev, status: "open" }));
    runMutation(() => publishBill(bill.id));
  }

  async function onCopyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/b/${bill.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function onConfirmDelete() {
    if (deleting) return;
    setSaveError(null);
    setDeleting(true);
    try {
      await deleteBill(bill.id);
      router.push("/dashboard");
    } catch (error) {
      setDeleting(false);
      setConfirmDeleteOpen(false);
      setSaveError({
        message: error instanceof Error ? error.message : "ลบบิลไม่สำเร็จ",
        retry: () => setConfirmDeleteOpen(true),
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-44 lg:pb-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-primary-ink underline transition hover:text-primary-deep active:scale-95"
            >
              ← บิลทั้งหมด
            </Link>
            {saved && !saveError && (
              <span aria-live="polite" className="text-xs text-ink-muted">
                บันทึกแล้ว ✓
              </span>
            )}
          </div>
          {bill.status === "locked" ? (
            <span className="whitespace-nowrap rounded-full bg-ink-muted px-3 py-1 text-sm font-bold text-white">
              💰 พร้อมเก็บเงิน
            </span>
          ) : bill.status === "open" ? (
            <span className="whitespace-nowrap rounded-full bg-success px-3 py-1 text-sm font-bold text-white">
              ✓ เปิดแล้ว
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {bill.status === "draft" ? (
            <button
              type="button"
              onClick={onPublish}
              disabled={items.length === 0}
              className="rounded-xl bg-primary px-6 py-3 font-bold text-white transition hover:bg-primary-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-ink"
              title={items.length === 0 ? "เพิ่มรายการอาหารก่อนเปิดบิล" : undefined}
            >
              เปิดบิล · Publish
            </button>
          ) : (
            /* Split-button: one visual unit, two verbs on the same object (the
               bill link) — copy it, or open it (issue #15). */
            <div className="flex items-stretch overflow-hidden rounded-xl bg-primary">
              <button
                type="button"
                onClick={onCopyLink}
                className="flex min-h-11 items-center px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-deep focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
              >
                {copied ? "คัดลอกลิงก์แล้ว ✓" : "คัดลอกลิงก์"}
              </button>
              <span aria-hidden className="w-px bg-white/30" />
              <Link
                href={`/b/${bill.id}`}
                aria-label="ดูยอดต่อคน"
                title="ดูยอดต่อคน"
                className="flex items-center px-3 text-lg font-bold text-white transition hover:bg-primary-deep focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
              >
                ↗
              </Link>
            </div>
          )}
          {bill.status !== "locked" && (
            <KebabMenu label="ตัวเลือกบิล">
              {(close) => (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close();
                    setConfirmDeleteOpen(true);
                  }}
                  className={`${kebabItemCls} text-danger`}
                >
                  ลบบิล
                </button>
              )}
            </KebabMenu>
          )}
        </div>
      </header>

      {saveError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger bg-danger/10 p-3 text-sm text-danger"
        >
          <span>บันทึกไม่สำเร็จ: {saveError.message} — การเปลี่ยนแปลงนี้ยังไม่ถูกบันทึก</span>
          <button
            type="button"
            onClick={() => {
              const retry = saveError.retry;
              retry();
            }}
            className="rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-danger"
          >
            ลองอีกครั้ง
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="ลบบิลนี้?"
        message={
          bill.status === "open"
            ? "บิลนี้แชร์ไปแล้ว เพื่อนอาจติ๊กหรือจ่ายเงินไปแล้ว การลบจะทำให้ข้อมูลทั้งหมดหายถาวร"
            : "บิลนี้จะถูกลบถาวร"
        }
        confirmLabel={deleting ? "กำลังลบ…" : "ลบถาวร"}
        cancelLabel="ยกเลิก"
        danger
        busy={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={onConfirmDelete}
      />

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

      <section className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">บิลนี้จ่ายเป็นเงินต่างประเทศ</h2>
            <p className="text-xs text-ink-muted">
              ใส่ราคาจากใบเสร็จตามสกุลเงินจริง แล้วแปลงเป็นบาทให้เพื่อนจ่ายกลับ
            </p>
          </div>
          <input
            type="checkbox"
            checked={bill.purchase_currency !== null}
            onChange={(e) =>
              saveBill(
                e.target.checked
                  ? { purchase_currency: "", fx_rate_numerator: 1, fx_rate_denominator: 1 }
                  : { purchase_currency: null, fx_rate_numerator: null, fx_rate_denominator: null },
              )
            }
            className="h-6 w-11 accent-primary"
            aria-label="เปิดใช้งานสกุลเงินต่างประเทศ"
          />
        </div>
        {bill.purchase_currency !== null && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              สกุลเงินต้นทาง
              <input
                key={`currency-${bill.purchase_currency}`}
                defaultValue={bill.purchase_currency ?? ""}
                placeholder="เช่น TWD"
                onBlur={(e) => {
                  const value = e.target.value.trim().toUpperCase();
                  if (value !== bill.purchase_currency) saveBill({ purchase_currency: value });
                }}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              อัตราแลกเปลี่ยน (1 {bill.purchase_currency || "หน่วย"} = ? ฿)
              <input
                key={`rate-${bill.fx_rate_numerator}-${bill.fx_rate_denominator}`}
                inputMode="decimal"
                defaultValue={fxRateToInput(bill.fx_rate_numerator, bill.fx_rate_denominator)}
                placeholder="1.15"
                onBlur={(e) => rateBlur(e, (n, d) => saveBill({ fx_rate_numerator: n, fx_rate_denominator: d }))}
                className={`${inputCls} tabular-nums`}
              />
              <span className="text-[11px] text-ink-muted">กรอกเอง ไม่ดึงอัตราสดจากอินเทอร์เน็ต</span>
            </label>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">รายการอาหาร</h2>
        {items.length === 0 && (
          <p className="text-sm text-ink-muted">ยังไม่มีรายการ — เพิ่มเมนูจากใบเสร็จได้เลย</p>
        )}
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            purchaseCurrency={bill.purchase_currency}
            onUpdate={onUpdateItem}
            onRemove={onRemoveItem}
          />
        ))}
        <button
          type="button"
          onClick={onAddItem}
          className="mt-1 self-start rounded-lg border border-border bg-surface-tint px-4 py-2.5 text-sm font-medium text-primary-ink transition hover:border-primary hover:bg-border active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink"
        >
          + เพิ่มเมนู
        </button>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold">ส่วนลด · Service charge · VAT</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            ส่วนลดบิล %
            <PercentBox
              key={`bill-discount-${bill.bill_discount_percent}`}
              defaultValue={bill.bill_discount_percent || ""}
              onBlur={(e) => saveBill({ bill_discount_percent: inputToPercent(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            ส่วนลดบิล
            <MoneyBox
              widthCls="w-full"
              symbol={bill.purchase_currency ?? "฿"}
              defaultValue={satangToInput(bill.bill_discount_satang)}
              onBlur={(e) => moneyBlur(e, (satang) => saveBill({ bill_discount_satang: satang }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Service charge %
            <PercentBox
              key={`sc-${bill.service_charge_percent}`}
              defaultValue={bill.service_charge_percent || ""}
              onBlur={(e) => saveBill({ service_charge_percent: inputToPercent(e.target.value) })}
            />
            <div className="flex gap-1 pt-0.5">
              <button
                type="button"
                onClick={() => saveBill({ service_charge_percent: 5 })}
                className={chipCls}
              >
                5%
              </button>
              <button
                type="button"
                onClick={() => saveBill({ service_charge_percent: 10 })}
                className={chipCls}
              >
                10%
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            VAT %
            <PercentBox
              key={`vat-${bill.vat_percent}`}
              defaultValue={bill.vat_percent || ""}
              onBlur={(e) => saveBill({ vat_percent: inputToPercent(e.target.value) })}
            />
            <div className="flex gap-1 pt-0.5">
              <button
                type="button"
                onClick={() => saveBill({ vat_percent: 7 })}
                className={chipCls}
              >
                7%
              </button>
            </div>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold">เช็คกับใบเสร็จ</h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            ยอดตามใบเสร็จ
            <MoneyBox
              widthCls="w-36"
              symbol={bill.purchase_currency ?? "฿"}
              defaultValue={satangToInput(bill.receipt_total_satang)}
              onBlur={(e) => moneyBlur(e, (satang) => saveBill({ receipt_total_satang: satang }))}
            />
          </label>
          <div className="flex min-w-48 flex-1 flex-col gap-1 border-t border-border pt-3 text-sm sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
            {/* #38: this block verifies against the paper receipt, so it always reads in the
                Purchase Currency (result.purchase), never the THB top-level fields — those are
                shown separately below, already converted. */}
            <div className="flex justify-between gap-4 tabular-nums text-ink-muted">
              <span>รวมรายการ</span>
              <span>{formatCheck(checkFigures.subtotalSatang)}</span>
            </div>
            {bill.service_charge_percent > 0 && (
              <div className="flex justify-between gap-4 tabular-nums text-ink-muted">
                <span>+ Service charge {bill.service_charge_percent}%</span>
                <span>{formatCheck(checkFigures.serviceChargeSatang)}</span>
              </div>
            )}
            {bill.vat_percent > 0 && (
              <div className="flex justify-between gap-4 tabular-nums text-ink-muted">
                <span>+ VAT {bill.vat_percent}%</span>
                <span>{formatCheck(checkFigures.vatSatang)}</span>
              </div>
            )}
            <div className="flex justify-between gap-4 font-bold tabular-nums text-ink">
              <span>รวม</span>
              <span>{formatCheck(checkFigures.receiptTotalSatang)}</span>
            </div>
            <span className={`font-bold ${receiptStatusCls(receipt.state)}`}>
              {receipt.label}
            </span>
          </div>
        </div>
        {/* #38: the converted ฿ total used to repeat here in its own box. The "ใครกินอะไร"
            matrix below now pins its reference column (ยอดที่ต้องจ่าย row), so that same
            figure stays visible while scrolling instead of only living in a separate box. */}
      </section>

      <PeerPicker
        peersOnBill={peers}
        recentPeers={recentPeers}
        selfPeerId={selfPeerId}
        onAdd={onAddPeer}
        onRemove={onRemovePeer}
      />

      <div className="hidden lg:block">
        <MatrixView
          items={items}
          peers={peers}
          ticks={ticks}
          result={result}
          receiptTotalSatang={bill.receipt_total_satang}
          billDiscountPercent={bill.bill_discount_percent}
          billDiscountSatang={bill.bill_discount_satang}
          selfPeerId={selfPeerId}
          purchaseCurrency={bill.purchase_currency}
          onToggle={onToggle}
          onUpdateBillAbsorber={onUpdateBillAbsorber}
        />
      </div>
      <div className="lg:hidden">
        <CardsView
          items={items}
          peers={peers}
          ticks={ticks}
          result={result}
          receiptTotalSatang={bill.receipt_total_satang}
          selfPeerId={selfPeerId}
          purchaseCurrency={bill.purchase_currency}
          onToggle={onToggle}
          onUpdateBillAbsorber={onUpdateBillAbsorber}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">ช่องทางรับเงิน</h2>
          {profileEmpty ? (
            <Link
              href="/profile"
              className="text-sm text-primary-ink underline transition hover:text-primary-deep"
            >
              ตั้งค่าโปรไฟล์เพื่อใช้ซ้ำ
            </Link>
          ) : (
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={followProfile}
                onChange={(e) => toggleFollowProfile(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              ใช้ข้อมูลจากโปรไฟล์
            </label>
          )}
        </div>

        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ชื่อบัญชี
          <input
            key={`name-${followProfile}-${bill.account_name}`}
            defaultValue={bill.account_name}
            disabled={followProfile}
            placeholder="ชื่อที่โชว์ให้เพื่อน"
            onBlur={(e) => {
              if (e.target.value !== bill.account_name)
                saveBill({ account_name: e.target.value });
            }}
            className={`${inputCls} disabled:opacity-60`}
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          พร้อมเพย์ (เบอร์ / เลขบัตรประชาชน)
          <input
            key={`ppid-${followProfile}-${bill.promptpay_id}`}
            defaultValue={bill.promptpay_id}
            disabled={followProfile}
            inputMode="numeric"
            placeholder="เช่น 0812345678"
            onBlur={(e) => {
              // Store digits only so a formatted number still drives a QR.
              const digits = e.target.value.replace(/\D/g, "");
              if (digits !== bill.promptpay_id) saveBill({ promptpay_id: digits });
            }}
            className={`${inputCls} disabled:opacity-60`}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="flex w-full flex-col gap-1 text-xs text-ink-muted sm:w-48">
            ธนาคาร (ถ้าไม่มีพร้อมเพย์)
            <input
              key={`bank-${followProfile}-${bill.bank_name}`}
              list="payment-methods"
              defaultValue={bill.bank_name}
              disabled={followProfile}
              placeholder="เช่น กสิกรไทย"
              onBlur={(e) => {
                if (e.target.value !== bill.bank_name)
                  saveBill({ bank_name: e.target.value });
              }}
              className={`${inputCls} disabled:opacity-60`}
            />
            <datalist id="payment-methods">
              <option value="กสิกรไทย" />
              <option value="ไทยพาณิชย์" />
              <option value="กรุงเทพ" />
              <option value="กรุงไทย" />
              <option value="กรุงศรี" />
              <option value="ทีทีบี" />
              <option value="ออมสิน" />
            </datalist>
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-ink-muted">
            เลขบัญชี
            <input
              key={`acct-${followProfile}-${bill.bank_account}`}
              defaultValue={bill.bank_account}
              disabled={followProfile}
              inputMode="numeric"
              placeholder="เลขบัญชี"
              onBlur={(e) => {
                if (e.target.value !== bill.bank_account)
                  saveBill({ bank_account: e.target.value });
              }}
              className={`${inputCls} disabled:opacity-60`}
            />
          </label>
        </div>

        {followProfile && (
          <p className="text-xs text-ink-muted">
            ดึงจาก{" "}
            <Link
              href="/profile"
              className="text-primary-ink underline transition hover:text-primary-deep"
            >
              โปรไฟล์
            </Link>{" "}
            เอาเครื่องหมายถูกออกเพื่อแก้เฉพาะบิลนี้
          </p>
        )}
      </section>

    </main>
  );
}

function ItemRow({
  item,
  purchaseCurrency,
  onUpdate,
  onRemove,
}: {
  item: LineItemRow;
  /** #38: when set, the money boxes' prefix becomes this instead of ฿. */
  purchaseCurrency: string | null;
  onUpdate: (id: string, patch: Partial<LineItemRow>) => void;
  onRemove: (id: string) => void;
}) {
  const symbol = purchaseCurrency ?? "฿";
  const formatMoney = (satang: number) =>
    purchaseCurrency ? formatMinorUnits(satang, purchaseCurrency) : formatSatang(satang);
  // Price, qty and total are three views of two stored fields, so the boxes are
  // written imperatively (same idiom as moneyBlur) rather than made controlled:
  // it keeps the derived box in step without remounting an input mid-tab.
  const priceRef = useRef<HTMLInputElement>(null);
  const totalRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  // null = the unit price is the held side. A number = the line total the
  // organizer typed, held across qty changes, because on a receipt the line
  // total is the fact and the qty is the typo. It stores what they TYPED, not
  // what the box shows: the box shows the settled figure, and re-settling that
  // at a new qty would stack a second round-up (see lineEntry.test.ts).
  const heldTotal = useRef<number | null>(null);
  // Set on input, not on blur: blur fires on a plain tab-through, which would
  // otherwise flip the held side without the organizer typing anything.
  const priceDirty = useRef(false);
  const totalDirty = useRef(false);
  const [roundedUp, setRoundedUp] = useState<string | null>(null);

  function currentQty(): number {
    const qty = parseInt(qtyRef.current?.value ?? "", 10);
    return Number.isNaN(qty) || qty < 1 ? item.qty : qty;
  }
  function writePrice(satang: number) {
    if (priceRef.current) priceRef.current.value = satangToInput(satang);
  }
  function writeTotal(satang: number) {
    if (totalRef.current) totalRef.current.value = satangToInput(satang);
  }

  /** Back-calculate the stored unit price from a typed total, surfacing any round-up. */
  function settleFromTotal(typedSatang: number, qty: number): number {
    const unit = unitPriceFromTotalSatang(typedSatang, qty);
    const settled = totalFromUnitPriceSatang(unit, qty);
    writePrice(unit);
    writeTotal(settled);
    setRoundedUp(
      settled === typedSatang
        ? null
        : `ปัดขึ้น: ${formatMoney(unit)} × ${qty} = ${formatMoney(settled)}`,
    );
    return unit;
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
      <label className="flex min-w-32 flex-1 flex-col gap-1 text-xs text-ink-muted">
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
      {/* The three linked boxes stay together when the row wraps on a phone. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ราคา
          <MoneyBox
            inputRef={priceRef}
            widthCls="w-28"
            symbol={symbol}
            defaultValue={satangToInput(item.unit_price_satang)}
            onInput={(e) => {
              priceDirty.current = true;
              // Live feedback while typing. Writes only the OTHER box, never the
              // one under the cursor, and never saves: persistence stays on blur.
              writeTotal(
                totalFromUnitPriceSatang(inputToSatang(e.currentTarget.value), currentQty()),
              );
            }}
            onBlur={(e) =>
              moneyBlur(e, (satang) => {
                if (!priceDirty.current) return; // tabbed through, nothing typed
                priceDirty.current = false;
                // Unit price typed: it becomes the held side and the total is
                // derived from it, exactly, with nothing to round.
                heldTotal.current = null;
                setRoundedUp(null);
                writeTotal(totalFromUnitPriceSatang(satang, currentQty()));
                if (satang !== item.unit_price_satang) {
                  onUpdate(item.id, { unit_price_satang: satang });
                }
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          จำนวน
          <input
            ref={qtyRef}
            inputMode="numeric"
            defaultValue={item.qty}
            onInput={() => {
              // Re-derive whichever box is not the held side, live.
              if (heldTotal.current !== null) {
                writePrice(unitPriceFromTotalSatang(heldTotal.current, currentQty()));
              } else {
                writeTotal(totalFromUnitPriceSatang(item.unit_price_satang, currentQty()));
              }
            }}
            onBlur={(e) => {
              const parsed = parseInt(e.target.value, 10);
              const qty = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
              e.target.value = String(qty);
              if (heldTotal.current !== null) {
                const unit = settleFromTotal(heldTotal.current, qty);
                onUpdate(item.id, { qty, unit_price_satang: unit });
              } else {
                writeTotal(totalFromUnitPriceSatang(item.unit_price_satang, qty));
                setRoundedUp(null);
                onUpdate(item.id, { qty });
              }
            }}
            className={`${inputCls} w-14 text-right tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          รวม (ก่อนลด)
          <MoneyBox
            inputRef={totalRef}
            widthCls="w-28"
            symbol={symbol}
            defaultValue={satangToInput(
              totalFromUnitPriceSatang(item.unit_price_satang, item.qty),
            )}
            onInput={(e) => {
              totalDirty.current = true;
              // Live feedback: back-derive the unit price as they type. The
              // settle (and the ปัดขึ้น note) waits for blur, so the round-up
              // never rewrites this box mid-keystroke and fights the cursor.
              writePrice(unitPriceFromTotalSatang(inputToSatang(e.currentTarget.value), currentQty()));
            }}
            onBlur={(e) => {
              // Receipts often print only this box; the unit price is what we store.
              const typed = inputToSatang(e.target.value);
              if (!totalDirty.current) {
                e.target.value = satangToInput(typed); // tabbed through: just normalize
                return;
              }
              totalDirty.current = false;
              heldTotal.current = typed;
              const unit = settleFromTotal(typed, currentQty());
              if (unit !== item.unit_price_satang) {
                onUpdate(item.id, { unit_price_satang: unit });
              }
            }}
          />
        </label>
      </div>
      {/* Likewise the discount pair, so ลด never wraps away from ลด %. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ลด %
          <PercentBox
            widthCls="w-16"
            defaultValue={item.discount_percent || ""}
            onBlur={(e) => {
              const value = parseInt(e.target.value, 10);
              onUpdate(item.id, {
                discount_percent: Number.isNaN(value) ? 0 : Math.min(100, Math.max(0, value)),
              });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ลด
          <MoneyBox
            widthCls="w-28"
            symbol={symbol}
            defaultValue={satangToInput(item.discount_satang)}
            onBlur={(e) => moneyBlur(e, (satang) => onUpdate(item.id, { discount_satang: satang }))}
          />
        </label>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`ลบ ${item.name || "รายการ"}`}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-danger transition hover:bg-surface-tint active:scale-95 focus-visible:outline-2 focus-visible:outline-danger"
        >
          ✕
        </button>
      </div>
      {roundedUp && (
        <p role="status" className="w-full text-xs text-ink-muted tabular-nums">
          {roundedUp}
        </p>
      )}
    </div>
  );
}

/** Display-only status: the not-yet-entered state is neutral, not an error. */
export function receiptStatus(
  receiptTotalSatang: number,
  checksumSatang: number,
  /** #38: the mismatch amount is on the same scale as both operands above — THB by
   * default, but Purchase Currency whenever the caller is comparing FX-scale figures. */
  format: (amountMinor: number) => string = formatSatang,
) {
  if (receiptTotalSatang === 0)
    return { state: "empty" as const, label: "ยังไม่ได้กรอกยอดใบเสร็จ" };
  if (receiptTotalSatang === checksumSatang)
    return { state: "match" as const, label: "✓ ตรงกับใบเสร็จ" };
  return {
    state: "mismatch" as const,
    label: `✗ ต่างจากใบเสร็จ ${format(Math.abs(checksumSatang - receiptTotalSatang))}`,
  };
}

export function receiptStatusCls(state: "empty" | "match" | "mismatch"): string {
  if (state === "match") return "text-success";
  if (state === "mismatch") return "text-danger";
  return "text-ink-muted";
}
