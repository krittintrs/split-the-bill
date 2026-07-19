"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { deleteBill } from "@/lib/bills/mutations";
import BillListItem, { type BillSummary } from "./BillListItem";

/** Owns the single delete-confirm dialog for all rows (issue #15). */
export default function BillList({ initialBills }: { initialBills: BillSummary[] }) {
  const [bills, setBills] = useState(initialBills);
  const [deleteTarget, setDeleteTarget] = useState<BillSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteBill(deleteTarget.id);
      setBills((prev) => prev.filter((bill) => bill.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error && (
        <p role="alert" className="px-1 text-sm text-danger">
          {error}
        </p>
      )}

      {bills.length === 0 ? (
        <p className="mt-8 text-center text-ink-muted">
          ยังไม่มีบิล สร้างบิลแรกของคุณด้วยปุ่มด้านบน
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bills.map((bill) => (
            <BillListItem key={bill.id} bill={bill} onRequestDelete={setDeleteTarget} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ลบบิลนี้?"
        message={
          deleteTarget?.status === "open"
            ? "บิลนี้แชร์ไปแล้ว เพื่อนอาจติ๊กหรือจ่ายเงินไปแล้ว การลบจะทำให้ข้อมูลทั้งหมดหายถาวร"
            : "บิลนี้จะถูกลบถาวร"
        }
        confirmLabel={deleting ? "กำลังลบ…" : "ลบถาวร"}
        cancelLabel="ยกเลิก"
        danger
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
