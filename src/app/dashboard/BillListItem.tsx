"use client";

import Link, { useLinkStatus } from "next/link";
import KebabMenu, { kebabItemCls } from "@/components/KebabMenu";
import Spinner from "@/components/Spinner";
import type { BillRow } from "@/lib/bills/types";

const dateFormat = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" });

export type BillSummary = Pick<BillRow, "id" | "restaurant" | "eaten_at" | "status">;

/** useLinkStatus only works inside a child of <Link>, not the Link's own renderer. */
function CardBody({ bill }: { bill: BillSummary }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`flex flex-1 items-center justify-between gap-3 ${pending ? "opacity-50" : ""}`}
    >
      <span className="font-medium">{bill.restaurant || "ยังไม่มีชื่อร้าน"}</span>
      <span className="flex items-center gap-3 text-sm">
        <span className="whitespace-nowrap text-ink-muted">
          {dateFormat.format(new Date(bill.eaten_at))}
        </span>
        {bill.status === "open" ? (
          <span className="whitespace-nowrap rounded-full bg-success px-3 py-1 text-sm font-bold text-white">
            ✓ เปิดแล้ว
          </span>
        ) : bill.status === "locked" ? (
          <span className="whitespace-nowrap rounded-full bg-ink-muted px-3 py-1 text-sm font-bold text-white">
            🔒 ล็อกแล้ว
          </span>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-surface-tint px-3 py-1 text-sm font-medium text-primary-ink">
            ฉบับร่าง
          </span>
        )}
        {pending && <Spinner className="text-primary-ink" />}
      </span>
    </span>
  );
}

/**
 * One dashboard bill row. A real <Link> (preserves cmd/ctrl/middle-click and
 * right-click), with useLinkStatus driving a dim + spinner while the route
 * change is pending (issue #19). Row actions live in a ⋯ menu so every row
 * keeps the same width; a locked bill shows a disabled delete entry instead
 * of a silently missing one (issue #15). The confirm dialog lives in BillList.
 */
export default function BillListItem({
  bill,
  onRequestDelete,
}: {
  bill: BillSummary;
  onRequestDelete: (bill: BillSummary) => void;
}) {
  return (
    <li className="flex items-stretch gap-2">
      <Link
        href={`/bills/${bill.id}`}
        className="flex min-h-14 flex-1 items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition hover:border-primary hover:bg-surface-tint active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-primary-ink"
      >
        <CardBody bill={bill} />
      </Link>

      <div className="flex items-center">
        <KebabMenu label={`ตัวเลือกบิล ${bill.restaurant || "ยังไม่มีชื่อร้าน"}`}>
          {(close) =>
            bill.status === "locked" ? (
              <button
                type="button"
                role="menuitem"
                disabled
                className={`${kebabItemCls} text-danger`}
              >
                ลบไม่ได้ (บิลถูกล็อก)
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onRequestDelete(bill);
                }}
                className={`${kebabItemCls} text-danger`}
              >
                ลบบิล
              </button>
            )
          }
        </KebabMenu>
      </div>
    </li>
  );
}
