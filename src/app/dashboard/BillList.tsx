"use client";

import { useState } from "react";
import BillListItem, { type BillSummary } from "./BillListItem";

export default function BillList({ initialBills }: { initialBills: BillSummary[] }) {
  const [bills, setBills] = useState(initialBills);

  function onDeleted(id: string) {
    setBills((prev) => prev.filter((bill) => bill.id !== id));
  }

  if (bills.length === 0) {
    return (
      <p className="mt-8 text-center text-ink-muted">
        ยังไม่มีบิล — สร้างบิลแรกของคุณด้วยปุ่มด้านบน
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {bills.map((bill) => (
        <BillListItem key={bill.id} bill={bill} onDeleted={onDeleted} />
      ))}
    </ul>
  );
}
