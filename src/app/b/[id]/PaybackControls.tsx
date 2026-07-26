"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildPromptPayPayload } from "@/lib/billing/promptpay";
import { formatSatang } from "@/lib/billing/money";

interface Props {
  peerName: string;
  totalSatang: number;
  promptpayId: string;
  bankName: string;
  bankAccount: string;
  accountName: string;
  paid: boolean;
  onPaid: () => void;
  pending: boolean;
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text); // primary
    return true;
  } catch {
    try {
      const el = document.createElement("textarea"); // in-app-browser fallback
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({
  text,
  label,
  variant,
}: {
  text: string;
  label: string;
  variant: "primary" | "tinted";
}) {
  const [done, setDone] = useState(false);
  const base =
    "min-h-11 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-95";
  const style =
    variant === "primary"
      ? "bg-primary text-white hover:bg-primary-deep"
      : "bg-surface-tint text-primary-ink hover:bg-border";
  return (
    <button
      type="button"
      className={`${base} ${style}`}
      onClick={async () => {
        if (await copy(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? "คัดลอกแล้ว ✓" : label}
    </button>
  );
}

export default function PaybackControls({
  peerName,
  totalSatang,
  promptpayId,
  bankName,
  bankAccount,
  accountName,
  paid,
  onPaid,
  pending,
}: Props) {
  const [qr, setQr] = useState<string>("");

  useEffect(() => {
    let active = true;
    let payload: string | null = null;
    if (promptpayId && totalSatang > 0) {
      try {
        payload = buildPromptPayPayload(promptpayId, totalSatang);
      } catch {
        payload = null; // malformed id: skip the QR, copy paths still work
      }
    }
    const pending = payload
      ? QRCode.toDataURL(payload, { margin: 1, width: 240 })
      : Promise.resolve("");
    pending
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setQr("");
      });
    return () => {
      active = false;
    };
  }, [promptpayId, totalSatang]);

  // ฿0 peer: no payback controls (zero state)
  if (totalSatang <= 0) {
    return (
      <div className="rounded-2xl border-2 border-primary bg-surface p-4 text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-tint text-xl font-bold text-success">
          ✓
        </div>
        <p className="font-semibold">ไม่มียอดต้องจ่าย</p>
        <p className="text-sm text-ink-muted">{peerName} ยังไม่ได้ติ๊กรายการไหน</p>
      </div>
    );
  }

  const amount = formatSatang(totalSatang); // "฿179.10"
  const amountPlain = (totalSatang / 100).toFixed(2); // "179.10"

  return (
    <div className="rounded-2xl border-2 border-primary bg-surface p-4 shadow-[0_10px_26px_-14px_rgba(6,158,200,0.55)]">
      <p className="text-sm text-ink-muted">
        ยอดของ <b className="text-primary-ink">{peerName}</b>
      </p>
      <p className="text-3xl font-extrabold tabular-nums tracking-tight">{amount}</p>
      {accountName && <p className="mb-3 text-sm text-ink-muted">โอนให้ {accountName}</p>}
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt="PromptPay QR"
          className="mx-auto mb-3 w-full max-w-[200px] rounded-lg border border-border bg-white p-2"
        />
      )}
      <div className="flex flex-col gap-2">
        <CopyButton text={amountPlain} label={`คัดลอกยอด ${amount}`} variant="primary" />
        {promptpayId && (
          <CopyButton
            text={promptpayId}
            label={`คัดลอกพร้อมเพย์ ${promptpayId}`}
            variant="tinted"
          />
        )}
        {!promptpayId && bankAccount && (
          <CopyButton
            text={bankAccount}
            label={`คัดลอกเลขบัญชี${bankName ? ` (${bankName})` : ""}`}
            variant="tinted"
          />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onPaid}
          className={`min-h-11 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${
            paid
              ? "bg-success text-white"
              : "border border-border text-ink-muted hover:bg-surface-tint"
          }`}
        >
          {paid ? "✓ จ่ายแล้ว" : "จ่ายแล้ว"}
        </button>
      </div>
    </div>
  );
}
