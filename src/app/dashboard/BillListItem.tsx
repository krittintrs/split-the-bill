"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import Spinner from "@/components/Spinner";
import { deleteBill } from "@/lib/bills/mutations";
import type { BillRow } from "@/lib/bills/types";

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });

export type BillSummary = Pick<BillRow, "id" | "restaurant" | "eaten_at" | "status">;

/**
 * One dashboard bill row. Navigates via useTransition so a tap visibly dims
 * and disables re-click while the route change is pending (issue #19), and
 * offers a hard-delete gated on status (locked bills never show it).
 */
export default function BillListItem({
  bill,
  onDeleted,
}: {
  bill: BillSummary;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    startTransition(() => {
      router.push(`/bills/${bill.id}`);
    });
  }

  async function onConfirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteBill(bill.id);
      onDeleted(bill.id);
    } catch (err) {
      setDeleting(false);
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={open}
          disabled={isPending}
          aria-busy={isPending}
          className={`flex min-h-14 flex-1 items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-transform hover:border-primary hover:bg-surface-tint active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary-ink disabled:cursor-wait ${
            isPending ? "opacity-50" : ""
          }`}
        >
          <span className="font-medium">{bill.restaurant || "ยังไม่มีชื่อร้าน"}</span>
          <span className="flex items-center gap-3 text-sm">
            <span className="text-ink-muted">
              {dateFormat.format(new Date(bill.eaten_at))}
            </span>
            {bill.status === "open" ? (
              <span className="rounded-full bg-success px-3 py-1 text-sm font-bold text-white">
                เปิดแล้ว
              </span>
            ) : (
              <span className="rounded-full bg-surface-tint px-3 py-1 text-sm font-medium text-primary-ink">
                ฉบับร่าง
              </span>
            )}
            {isPending && <Spinner className="text-primary-ink" />}
          </span>
        </button>

        {bill.status !== "locked" && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={`ลบบิล ${bill.restaurant || "ยังไม่มีชื่อร้าน"}`}
            className="flex min-h-14 w-11 items-center justify-center rounded-xl border border-border text-danger transition-transform hover:bg-danger/10 active:scale-95 focus-visible:outline-2 focus-visible:outline-danger"
          >
            ✕
          </button>
        )}
      </div>

      {error && <p className="px-1 text-xs text-danger">{error}</p>}

      <ConfirmDialog
        open={confirmOpen}
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
        onCancel={() => setConfirmOpen(false)}
        onConfirm={onConfirmDelete}
      />
    </li>
  );
}
