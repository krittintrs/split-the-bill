// PROTOTYPE — bill-level fields (discount / SC / VAT / receipt check),
// dropped into each variant wherever that variant keeps its totals.
import { formatSatang } from "@/lib/billing/money";
import { parseThbToSatang, type BillMeta } from "./shared";

interface Props {
  billMeta: BillMeta;
  onMetaChange: (meta: BillMeta) => void;
  receiptText: string;
  onReceiptChange: (text: string) => void;
  checksumSatang: number;
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs opacity-80">
      {label}
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => {
          const parsed = parseInt(e.target.value || "0", 10);
          onChange(Number.isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed)));
        }}
        className="w-14 rounded border border-black/20 bg-transparent p-2 text-right tabular-nums text-sm dark:border-white/25"
      />
    </label>
  );
}

export default function BillMetaFields({
  billMeta,
  onMetaChange,
  receiptText,
  onReceiptChange,
  checksumSatang,
}: Props) {
  const receiptSatang = parseThbToSatang(receiptText);
  const matches = receiptSatang !== null && receiptSatang === checksumSatang;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <PercentField
        label="Bill disc %"
        value={billMeta.billDiscountPercent}
        onChange={(v) => onMetaChange({ ...billMeta, billDiscountPercent: v })}
      />
      <PercentField
        label="SC %"
        value={billMeta.serviceChargePercent}
        onChange={(v) => onMetaChange({ ...billMeta, serviceChargePercent: v })}
      />
      <PercentField
        label="VAT %"
        value={billMeta.vatPercent}
        onChange={(v) => onMetaChange({ ...billMeta, vatPercent: v })}
      />
      <label className="flex flex-col gap-1 text-xs opacity-80">
        Receipt ฿
        <input
          value={receiptText}
          inputMode="decimal"
          onChange={(e) => onReceiptChange(e.target.value)}
          className="w-24 rounded border border-black/20 bg-transparent p-2 text-right tabular-nums text-sm dark:border-white/25"
        />
      </label>
      <span
        className={`pb-2 text-sm font-bold ${matches ? "text-emerald-600" : "text-red-500"}`}
      >
        {matches ? "✓ matches" : `✗ ${formatSatang(checksumSatang)}`}
      </span>
    </div>
  );
}
