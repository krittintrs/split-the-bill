"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildPromptPayPayload } from "@/lib/billing/promptpay";
import type { ProfileRow } from "@/lib/bills/types";
import { saveProfile } from "./actions";

const inputCls =
  "min-h-11 rounded-lg border border-border bg-surface p-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-primary-ink";

type Field = "account_name" | "promptpay_id" | "bank_name" | "bank_account";

export default function ProfileForm({ profile }: { profile: ProfileRow }) {
  const [values, setValues] = useState({
    account_name: profile.account_name,
    promptpay_id: profile.promptpay_id,
    bank_name: profile.bank_name,
    bank_account: profile.bank_account,
  });
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [previewQr, setPreviewQr] = useState("");
  // What's currently persisted, so blur only writes real changes.
  const [stored, setStored] = useState({
    account_name: profile.account_name,
    promptpay_id: profile.promptpay_id,
    bank_name: profile.bank_name,
    bank_account: profile.bank_account,
  });

  // Persist a field on blur only when it changed from what's stored. `stored`
  // advances only on success so a failed save stays retryable on the next blur.
  async function commit(field: Field, value: string) {
    // Store promptpay as digits only so a formatted number still drives a QR.
    const next = field === "promptpay_id" ? value.replace(/\D/g, "") : value;
    if (next === stored[field]) return;
    try {
      await saveProfile({ [field]: next });
      setStored((s) => ({ ...s, [field]: next }));
      if (next !== value) setValues((v) => ({ ...v, [field]: next })); // show normalized
      setSaveFailed(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setSaveFailed(true);
    }
  }

  useEffect(() => {
    let active = true;
    const id = values.promptpay_id.replace(/\D/g, "");
    const pending = [10, 13, 15].includes(id.length)
      ? QRCode.toDataURL(buildPromptPayPayload(id), { margin: 1, width: 200 })
      : Promise.resolve("");
    pending
      .then((url) => {
        if (active) setPreviewQr(url);
      })
      .catch(() => {
        if (active) setPreviewQr("");
      });
    return () => {
      active = false;
    };
  }, [values.promptpay_id]);

  function bind(field: Field) {
    return {
      value: values[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setValues((v) => ({ ...v, [field]: e.target.value })),
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => commit(field, e.target.value),
      className: inputCls,
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 font-semibold text-primary-ink">ชื่อบัญชี</h2>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          ชื่อที่โชว์ให้เพื่อนยืนยันก่อนโอน
          <input placeholder="เช่น กฤติน ธ." {...bind("account_name")} />
        </label>
      </section>

      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 font-semibold text-primary-ink">พร้อมเพย์</h2>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          เบอร์โทร / เลขบัตรประชาชน
          <input
            inputMode="numeric"
            placeholder="เช่น 0812345678"
            {...bind("promptpay_id")}
          />
        </label>
        {previewQr && (
          <figure className="mt-3 flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewQr}
              alt="ตัวอย่าง QR ของคุณ"
              className="w-full max-w-[180px] rounded-lg border border-border bg-white p-2"
            />
            <figcaption className="text-xs text-ink-muted">
              ตัวอย่าง QR ของคุณ สแกนเช็กได้ว่าถูกบัญชี
            </figcaption>
          </figure>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-3">
        <h2 className="mb-2 font-semibold text-primary-ink">
          บัญชีธนาคาร (ถ้าไม่มีพร้อมเพย์)
        </h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex w-full flex-col gap-1 text-xs text-ink-muted sm:w-48">
            ธนาคาร
            <input
              list="bank-names"
              placeholder="เช่น กสิกรไทย"
              {...bind("bank_name")}
            />
            <datalist id="bank-names">
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
            <input inputMode="numeric" placeholder="เลขบัญชี" {...bind("bank_account")} />
          </label>
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <span>กรอกอย่างน้อยหนึ่งช่องทาง</span>
        {saveFailed ? (
          <span className="font-medium text-danger" aria-live="polite">
            ⚠ บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง
          </span>
        ) : (
          <span
            className={`text-success transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}
            aria-live="polite"
          >
            ✓ บันทึกแล้ว
          </span>
        )}
      </div>
    </div>
  );
}
