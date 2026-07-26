# Payback (payment info, QR, copy paths) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** #10
**Goal:** Let the organizer store typed payment info, and give each peer (who taps their own name) a PromptPay QR with their exact amount plus copy-number / copy-amount / bank-text payback controls.
**Architecture:** A pure EMV PromptPay payload builder in `src/lib/billing/` (TDD, golden vectors) feeds a client-side `qrcode` render in the peer view. Payment info moves from the free-form `payment_info`/`payment_method` pair to typed columns (`promptpay_id`, `bank_name`, `bank_account`, `account_name`) on both `profiles` and `bills`, exposed through the existing `get_bill` anon RPC. A new `/profile` page edits the profile; the bill editor snapshots it via a "follow profile" toggle. **Peer UI = design "C+"** (locked via `/impeccable`, see the mock): no separate claim strip — the existing "ทุกคน" list is the selector; tapping your name (a device-local claim in `localStorage["claim:<billId>"]`, no login) reveals a prominent payback panel pinned at the **top** and auto-scrolls to it; the row is marked "คุณ" and re-selected on next visit.

**Tech Stack:** Next.js (App Router, TS) + Tailwind, Supabase (Postgres, Auth, RLS, RPC), `qrcode` (render only), Vitest.

## Global Constraints (from CLAUDE.md)

- All money/QR-payload math lives in `src/lib/billing/` as pure functions. No money arithmetic in components, API routes, or DB.
- Money is integer satang everywhere; convert to ฿ decimal only at the display edge.
- Peer access is capability-URL only (ADR-0002); nothing peer-facing may require login. Anon reads go through `get_bill` only (ADR-0006).
- `src/lib/billing/` changes are TDD (failing test → implement → green). Canonical Katsu fixture must stay green (A=179.10 … checksum 902.70).
- Tailwind tokens are source of truth; no em dashes in UI copy; min 12px; Thai-friendly; amounts as `฿1,234.50`.
- DoD = `npm run check` zero errors. Peer flows verified on a mobile viewport.
- Decisions: **ADR-0008** (generated QR, not upload; client-side), **ADR-0009** (typed model + in-house EMV builder + carry-over migration).

---

## File Map

- **Create** `src/lib/billing/promptpay.ts` — pure `buildPromptPayPayload(id, satang?)` → EMV string (amount optional; omitted = static QR for the profile preview).
- **Create** `src/lib/billing/promptpay.test.ts` — golden-vector tests (dynamic + static).
- **Create** `supabase/migrations/20260725000000_typed_payment.sql` — typed columns, carry-over, drop legacy, rebuild `get_bill`.
- **Create** `src/app/profile/page.tsx` + `src/app/profile/ProfileForm.tsx` + `src/app/profile/actions.ts` — profile payment editor (authenticated), incl. a static QR preview of the organizer's own PromptPay ID.
- **Modify** `src/lib/bills/types.ts` — `BillRow` + new `ProfileRow`.
- **Modify** `src/lib/bills/getBill.ts` — `GetBillJson.bill` typed payment fields.
- **Modify** `src/lib/bills/mutations.ts` — allow new bill payment columns in the update whitelist.
- **Modify** `src/app/bills/[id]/BillEditor.tsx` — typed payment fields + "follow profile" toggle.
- **Modify** `src/app/b/[id]/PeerBill.tsx` — device-local claim (`localStorage`), make the "ทุกคน" rows selectable, render `PaybackControls` pinned at the top for the selected peer, auto-scroll on select.
- **Create** `src/app/b/[id]/PaybackControls.tsx` — the selected-peer payback panel: QR + copy-amount + copy-number + bank fallback + account name + paid toggle; renders the "ไม่มียอดต้องจ่าย" zero state.

---

## Task 1: PromptPay EMV payload builder (pure, TDD)

**Files:**
- Create: `src/lib/billing/promptpay.ts`
- Test: `src/lib/billing/promptpay.test.ts`

**Interfaces:**
- Produces: `buildPromptPayPayload(id: string, satang?: number): string` — `id` is 10-digit phone, 13-digit national/tax ID, or 15-digit e-wallet. With `satang` (positive integer) → dynamic QR (POI `12`, amount baked in). Without → static QR (POI `11`, no amount) for the profile preview. Throws on invalid id length/non-digits or `satang <= 0`.

- [ ] **Step 1: Write the failing test** (golden vectors captured from `promptpay-qr`)

```ts
// src/lib/billing/promptpay.test.ts
import { describe, it, expect } from "vitest";
import { buildPromptPayPayload } from "./promptpay";

describe("buildPromptPayPayload", () => {
  it("phone number, ฿179.10", () => {
    expect(buildPromptPayPayload("0942490949", 17910)).toBe(
      "00020101021229370016A000000677010111011300669424909495802TH53037645406179.1063044786",
    );
  });
  it("phone number, ฿100.00", () => {
    expect(buildPromptPayPayload("0812345678", 10000)).toBe(
      "00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304BB8A",
    );
  });
  it("national ID (13 digits), ฿214.20", () => {
    expect(buildPromptPayPayload("1234567890123", 21420)).toBe(
      "00020101021229370016A000000677010111021312345678901235802TH53037645406214.20630465AD",
    );
  });
  it("sub-baht amount ฿0.50 keeps two decimals", () => {
    expect(buildPromptPayPayload("0954539553", 50)).toBe(
      "00020101021229370016A000000677010111011300669545395535802TH530376454040.5063042DFF",
    );
  });
  it("static QR (no amount) for the profile preview — POI 11, no amount tag", () => {
    expect(buildPromptPayPayload("0942490949")).toBe(
      "00020101021129370016A000000677010111011300669424909495802TH530376463040850",
    );
  });
  it("rejects invalid id length", () => {
    expect(() => buildPromptPayPayload("12345", 100)).toThrow();
  });
  it("rejects non-positive amount", () => {
    expect(() => buildPromptPayPayload("0812345678", 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/billing/promptpay.test.ts`
Expected: FAIL — `buildPromptPayPayload` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/billing/promptpay.ts
// EMVCo Merchant-Presented Mode / Bank of Thailand PromptPay QR payload (ADR-0009).
// Pure: (id, satang) -> deterministic EMV string. Golden-vector tested.

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, computed over the string incl. "6304". */
function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function merchantAccount(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== id.length) throw new Error("id must be digits only");
  const aid = tlv("00", "A000000677010111");
  let target: string;
  if (id.length === 10) {
    // phone: drop leading 0, prefix country code 66, pad to 13 -> sub-tag 01
    target = tlv("01", ("0066" + id.replace(/^0/, "")).padStart(13, "0"));
  } else if (id.length === 13) {
    target = tlv("02", id); // national / tax ID
  } else if (id.length === 15) {
    target = tlv("03", id); // e-wallet
  } else {
    throw new Error("id must be 10, 13, or 15 digits");
  }
  return tlv("29", aid + target);
}

export function buildPromptPayPayload(id: string, satang?: number): string {
  const hasAmount = satang !== undefined;
  if (hasAmount && (!Number.isInteger(satang) || (satang as number) <= 0))
    throw new Error("satang must be a positive integer");
  const body =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") + // 12 = dynamic (amount), 11 = static
    merchantAccount(id) +
    tlv("58", "TH") +
    tlv("53", "764") + // THB
    (hasAmount ? tlv("54", ((satang as number) / 100).toFixed(2)) : "");
  const withCrcTag = body + "6304";
  return withCrcTag + crc16(withCrcTag);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/billing/promptpay.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Confirm the canonical fixture still green**

Run: `npx vitest run src/lib/billing`
Expected: PASS (all billing tests, incl. Katsu checksum 902.70).

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/promptpay.ts src/lib/billing/promptpay.test.ts
git commit -m "feat(billing): PromptPay EMV payload builder"
```

---

## Task 2: Typed payment migration + get_bill rebuild

**Files:**
- Create: `supabase/migrations/20260725000000_typed_payment.sql`

**Interfaces:**
- Produces: `profiles` and `bills` gain `promptpay_id`, `bank_name`, `bank_account`, `account_name` (all `text not null default ''`); `bills.payment_info` and `bills.payment_method` dropped; `profiles.payment_info` dropped. `get_bill` returns `promptpayId`, `bankName`, `bankAccount`, `accountName` in its `bill` object (no more `paymentInfo`/`paymentMethod`).

- [ ] **Step 1: Write the migration**

```sql
-- #10 payback: typed payment fields (ADR-0009). Replaces free-form payment_info/payment_method.
alter table profiles add column promptpay_id text not null default '';
alter table profiles add column bank_name text not null default '';
alter table profiles add column bank_account text not null default '';
alter table profiles add column account_name text not null default '';

alter table bills add column promptpay_id text not null default '';
alter table bills add column bank_name text not null default '';
alter table bills add column bank_account text not null default '';
alter table bills add column account_name text not null default '';

-- Carry over legacy bill data (ADR-0009): promptpay keyword OR (blank method + 10-digit 0-phone),
-- with a valid 10/13/15 length -> promptpay_id; everything else -> bank_account (+ bank_name).
update bills set promptpay_id = payment_info
where payment_info ~ '^[0-9]+$'
  and char_length(payment_info) in (10, 13, 15)
  and (
    payment_method ilike '%promptpay%'
    or payment_method ilike '%promptay%'
    or payment_method ilike '%พร้อมเพย์%'
    or (payment_method = '' and char_length(payment_info) = 10 and payment_info like '0%')
  );

update bills
set bank_account = payment_info,
    bank_name = payment_method
where promptpay_id = '' and payment_info <> '';

alter table bills drop column payment_info;
alter table bills drop column payment_method;
alter table profiles drop column payment_info;

-- Rebuild get_bill (ADR-0006: still the only anon door) with typed fields.
create or replace function get_bill(p_bill_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'bill', jsonb_build_object(
      'id', b.id, 'restaurant', b.restaurant, 'eatenAt', b.eaten_at,
      'status', b.status,
      'billDiscountPercent', b.bill_discount_percent,
      'billDiscountSatang', b.bill_discount_satang,
      'serviceChargePercent', b.service_charge_percent,
      'vatPercent', b.vat_percent,
      'receiptTotalSatang', b.receipt_total_satang,
      'promptpayId', b.promptpay_id,
      'bankName', b.bank_name,
      'bankAccount', b.bank_account,
      'accountName', b.account_name
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', li.id, 'name', li.name, 'unitPriceSatang', li.unit_price_satang,
        'qty', li.qty, 'discountPercent', li.discount_percent,
        'discountSatang', li.discount_satang, 'position', li.position
      ) order by li.position), '[]'::jsonb)
      from line_items li where li.bill_id = b.id
    ),
    'peers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'paidAt', bp.paid_at
      )), '[]'::jsonb)
      from bill_peers bp join peers p on p.id = bp.peer_id where bp.bill_id = b.id
    ),
    'ticks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lineItemId', t.line_item_id, 'peerId', t.peer_id
      )), '[]'::jsonb)
      from ticks t join line_items li on li.id = t.line_item_id where li.bill_id = b.id
    )
  )
  from bills b
  where b.id = p_bill_id and b.status in ('open', 'locked');
$$;
```

- [ ] **Step 2: Apply to the linked project**

Run: `supabase db push --linked`
Expected: migration applies with no error.

- [ ] **Step 3: Verify the carry-over on real rows**

Run: `supabase db query --linked "select id, promptpay_id, bank_name, bank_account from bills where promptpay_id <> '' or bank_account <> '';"`
Expected: rows `0942490949` / `0922747419` / `0954539553` / `0812345678` land in `promptpay_id`; `2642732251` (SCB) and `7322632637` (กสิกรไทย) land in `bank_account` with matching `bank_name`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260725000000_typed_payment.sql
git commit -m "feat(db): typed payment fields + get_bill rebuild"
```

---

## Task 3: Types + getBill mapping

**Files:**
- Modify: `src/lib/bills/types.ts`
- Modify: `src/lib/bills/getBill.ts`
- Modify: `src/lib/bills/mutations.ts`

**Interfaces:**
- Consumes: migration field names from Task 2.
- Produces: `ProfileRow`; `BillRow` payment fields; `GetBillJson.bill` payment fields; `mutations.ts` whitelist accepts the four new bill columns.

- [ ] **Step 1: Update `BillRow` and add `ProfileRow` in `types.ts`**

Replace the `payment_info` / `payment_method` lines in `BillRow` with:

```ts
  promptpay_id: string;
  bank_name: string;
  bank_account: string;
  account_name: string;
```

Add:

```ts
export interface ProfileRow {
  user_id: string;
  promptpay_id: string;
  bank_name: string;
  bank_account: string;
  account_name: string;
}
```

- [ ] **Step 2: Update `GetBillJson.bill` in `getBill.ts`**

Replace `paymentInfo: string;` and `paymentMethod: string;` with:

```ts
    promptpayId: string;
    bankName: string;
    bankAccount: string;
    accountName: string;
```

- [ ] **Step 3: Update the mutation whitelist in `mutations.ts`**

Replace the `"payment_info"` (and any `"payment_method"`) whitelist entry with:

```ts
    | "promptpay_id"
    | "bank_name"
    | "bank_account"
    | "account_name"
```

- [ ] **Step 4: Typecheck**

Run: `npm run check`
Expected: FAIL only in `BillEditor.tsx` / `PeerBill.tsx` (old field references) — fixed in Tasks 4–6. No errors in `src/lib/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bills/types.ts src/lib/bills/getBill.ts src/lib/bills/mutations.ts
git commit -m "feat(bills): typed payment fields in types + getBill + mutations"
```

---

## Task 4: Profile page (authenticated)

**Files:**
- Create: `src/app/profile/page.tsx`, `src/app/profile/ProfileForm.tsx`, `src/app/profile/actions.ts`

**Interfaces:**
- Consumes: `ProfileRow` (Task 3); the app's server Supabase client (match the pattern in `src/app/dashboard/`).
- Produces: `/profile` route; `saveProfile(patch: Partial<Omit<ProfileRow, "user_id">>)` server action that upserts the caller's `profiles` row (RLS on `auth.uid()`).

- [ ] **Step 1: Write the server action** (`actions.ts`)

Follow `src/app/dashboard/actions.ts` for the server client + auth guard. Implement:

```ts
"use server";
import { createClient } from "@/lib/supabase/server"; // match dashboard's import
import type { ProfileRow } from "@/lib/bills/types";

export async function saveProfile(
  patch: Partial<Omit<ProfileRow, "user_id">>,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");
  await supabase.from("profiles").upsert({ user_id: user.id, ...patch });
}
```

- [ ] **Step 2: Write the page** (`page.tsx`) — server component that loads the row and renders the form

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";
import type { ProfileRow } from "@/lib/bills/types";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  const profile: ProfileRow = data ?? {
    user_id: user.id, promptpay_id: "", bank_name: "", bank_account: "", account_name: "",
  };
  return <ProfileForm profile={profile} />;
}
```

- [ ] **Step 3: Write the form** (`ProfileForm.tsx`, client) — autosave on blur via `saveProfile`, Tailwind tokens matching `BillEditor.tsx`. Match the confirmed mock: **three grouped cards** (`rounded-xl border border-border bg-surface p-3`), each with a `text-primary-ink` group title.
  - **ชื่อบัญชี** — `account_name` (helper: "โชว์ให้เพื่อนยืนยันก่อนโอน")
  - **พร้อมเพย์** — `promptpay_id` (helper: "เบอร์โทร / เลขบัตรประชาชน")
  - **บัญชีธนาคาร (ถ้าไม่มีพร้อมเพย์)** — `bank_name` + `bank_account` in a 2-col row

  Helper line under the form: "กรอกอย่างน้อยหนึ่งช่องทาง". Save each field on blur only when changed (mirror `BillEditor.tsx:489-493`). Show a transient "✓ บันทึกแล้ว" on save. Full state coverage: empty, focus-visible, saving, saved.

- [ ] **Step 4: Add the static QR preview.** First install the render lib (shared with Task 6): `npm i qrcode && npm i -D @types/qrcode && npm audit` (report any advisory before continuing). Then, below the fields, when `promptpay_id` is a valid length (10/13/15 digits), render a static QR of the organizer's own ID for a scan-check (confirmed decision). Client-side, no amount:

```tsx
// inside ProfileForm.tsx
import QRCode from "qrcode";
import { buildPromptPayPayload } from "@/lib/billing/promptpay";
// ...
const [previewQr, setPreviewQr] = useState("");
useEffect(() => {
  const id = promptpayId.replace(/\D/g, "");
  if ([10, 13, 15].includes(id.length)) {
    QRCode.toDataURL(buildPromptPayPayload(id), { margin: 1, width: 200 }) // no amount = static
      .then(setPreviewQr).catch(() => setPreviewQr(""));
  } else {
    setPreviewQr("");
  }
}, [promptpayId]);
// render: {previewQr && <figure> <img src={previewQr} alt="ตัวอย่าง QR ของคุณ" />
//   <figcaption>ตัวอย่าง QR ของคุณ — สแกนเช็กได้ว่าถูกบัญชี</figcaption> </figure>}
```

- [ ] **Step 5: Verify build + route**

Run: `npm run check`
Expected: PASS for `src/app/profile/**`.

- [ ] **Step 6: Commit**

```bash
git add src/app/profile
git commit -m "feat(profile): payment info editor + static QR preview"
```

---

## Task 5: Bill editor typed fields + follow-profile toggle

**Files:**
- Modify: `src/app/bills/[id]/BillEditor.tsx` (payment section ~lines 460-495)

**Interfaces:**
- Consumes: `saveBill` (existing) now accepting the four new columns (Task 3); the loaded `profile` row (pass from the bill page server component, same way the bill is passed).
- Produces: payment section editing `promptpay_id` / `bank_name` / `bank_account` / `account_name`, plus a "ใช้ข้อมูลจากโปรไฟล์" (follow profile) checkbox, default on.

- [ ] **Step 1: Pass the profile into the editor.** In the bill page server component that renders `BillEditor`, load the organizer's `profiles` row (as in Task 4 Step 2) and pass it as a `profile` prop.

- [ ] **Step 2: Replace the payment inputs.** Swap the `payment_method` datalist + `payment_info` input (BillEditor.tsx ~460-495) for four fields bound to the new columns, each saving on blur when changed (mirror the existing `saveBill({ ... })` on-change pattern).

- [ ] **Step 3: Add the follow-profile checkbox.** Default checked. When checked, snapshot the profile's four values onto the bill via one `saveBill({ promptpay_id, bank_name, bank_account, account_name })` and disable the four inputs; when unchecked, enable them for a per-bill override. Persist the checkbox state in a bill-local `useState` (no new column needed — it is a snapshot action, not stored state).

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: PASS for `BillEditor.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/bills/[id]
git commit -m "feat(editor): typed payment fields + follow-profile snapshot"
```

---

## Task 6: Peer payback panel + claim (design C+)

Implements the locked "C+" design: no separate claim strip — the "ทุกคน" list is the selector; tapping a name is a device-local claim that reveals the payback panel pinned at the **top** and auto-scrolls to it. `qrcode` was installed in Task 4.

**Files:**
- Create: `src/app/b/[id]/PaybackControls.tsx` — the selected-peer panel.
- Modify: `src/app/b/[id]/PeerBill.tsx` — claim state, selectable rows, top panel, auto-scroll; remove the old `paymentInfo` block (~376-386).

**Interfaces:**
- Consumes: `buildPromptPayPayload` (Task 1); `formatSatang` (`src/lib/billing/money.ts`); `result.peerTotals[peerId]` and `peerName` (already in `PeerBill.tsx`); `bill.bill.{promptpayId,bankName,bankAccount,accountName}` (Task 2/3).
- Produces: `PaybackControls` rendering the crafted panel (account name, big amount, QR, copy-amount [primary], copy-number [tinted], bank fallback, paid toggle) and the "ไม่มียอดต้องจ่าย" zero state.

- [ ] **Step 1: Write `PaybackControls.tsx`** (client) — matches the confirmed mock's `.payback` panel and `DESIGN.md` tokens.

```tsx
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

function CopyButton({ text, label, variant }: { text: string; label: string; variant: "primary" | "tinted" }) {
  const [done, setDone] = useState(false);
  const base = "min-h-11 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-95";
  const style = variant === "primary"
    ? "bg-primary text-white hover:bg-primary-deep"
    : "bg-surface-tint text-primary-ink hover:bg-border";
  return (
    <button
      type="button"
      className={`${base} ${style}`}
      onClick={async () => { if (await copy(text)) { setDone(true); setTimeout(() => setDone(false), 1500); } }}
    >
      {done ? "คัดลอกแล้ว ✓" : label}
    </button>
  );
}

export default function PaybackControls({
  peerName, totalSatang, promptpayId, bankName, bankAccount, accountName, paid, onPaid, pending,
}: Props) {
  const [qr, setQr] = useState<string>("");
  useEffect(() => {
    if (promptpayId && totalSatang > 0) {
      QRCode.toDataURL(buildPromptPayPayload(promptpayId, totalSatang), { margin: 1, width: 240 })
        .then(setQr).catch(() => setQr(""));
    } else {
      setQr("");
    }
  }, [promptpayId, totalSatang]);

  // ฿0 peer: no payback controls (zero state)
  if (totalSatang <= 0) {
    return (
      <div className="rounded-2xl border-2 border-primary bg-surface p-4 text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-tint text-xl font-bold text-success">✓</div>
        <p className="font-semibold">ไม่มียอดต้องจ่าย</p>
        <p className="text-sm text-ink-muted">{peerName} ยังไม่ได้ติ๊กรายการไหน</p>
      </div>
    );
  }

  const amount = formatSatang(totalSatang);          // "฿179.10"
  const amountPlain = (totalSatang / 100).toFixed(2); // "179.10"

  return (
    <div className="rounded-2xl border-2 border-primary bg-surface p-4 shadow-[0_10px_26px_-14px_rgba(6,158,200,0.55)]">
      <p className="text-sm text-ink-muted">ยอดของ <b className="text-primary-ink">{peerName}</b></p>
      <p className="text-3xl font-extrabold tabular-nums tracking-tight">{amount}</p>
      {accountName && <p className="mb-3 text-sm text-ink-muted">โอนให้ {accountName}</p>}
      {qr && <img src={qr} alt="PromptPay QR" className="mx-auto mb-3 w-full max-w-[200px] rounded-lg border border-border bg-white p-2" />}
      <div className="flex flex-col gap-2">
        <CopyButton text={amountPlain} label={`คัดลอกยอด ${amount}`} variant="primary" />
        {promptpayId && <CopyButton text={promptpayId} label={`คัดลอกพร้อมเพย์ ${promptpayId}`} variant="tinted" />}
        {!promptpayId && bankAccount && (
          <CopyButton text={bankAccount} label={`คัดลอกเลขบัญชี${bankName ? ` (${bankName})` : ""}`} variant="tinted" />
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onPaid}
          className={`min-h-11 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-50 ${
            paid ? "bg-success text-white" : "border border-border text-ink-muted hover:bg-surface-tint"
          }`}
        >
          {paid ? "✓ จ่ายแล้ว" : "จ่ายแล้ว"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add claim state + selectable rows in `PeerBill.tsx`.** Near the other `useState`, add the device-local claim (guard `localStorage` for SSR):

```tsx
const [claimedId, setClaimedId] = useState<string | null>(null);
const panelRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  setClaimedId(localStorage.getItem(`claim:${billId}`)); // restore on load
}, [billId]);
function claim(peerId: string) {
  setClaimedId(peerId);
  localStorage.setItem(`claim:${billId}`, peerId);
  requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
}
```

  In the "ทุกคน" list (`everyoneSection`), make each row a button that calls `claim(peer.id)`; mark the claimed row with a "คุณ" tag (`bg-primary text-white` pill) and keep its existing total. The per-row paid pill stays for non-claimed peers; the claimed peer's paid control lives in the top panel instead.

- [ ] **Step 3: Render the panel at the top of `PeerBill.tsx`.** Remove the old `bill.bill.paymentInfo` block (~376-386). Just under the header (above `matrixView`/`chipListView`), render:

```tsx
{claimedId ? (
  <div ref={panelRef}>
    <PaybackControls
      peerName={peerName.get(claimedId) ?? ""}
      totalSatang={result.peerTotals[claimedId] ?? 0}
      promptpayId={bill.bill.promptpayId}
      bankName={bill.bill.bankName}
      bankAccount={bill.bill.bankAccount}
      accountName={bill.bill.accountName}
      paid={paid[claimedId] ?? false}
      onPaid={() => onPaid(claimedId)}
      pending={pending}
    />
  </div>
) : (
  <div ref={panelRef} className="rounded-2xl border-2 border-dashed border-border bg-surface-tint/60 p-6 text-center">
    <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-surface-tint text-xl text-primary-ink">↓</div>
    <p className="font-bold">แตะชื่อของคุณด้านล่าง</p>
    <p className="text-sm text-ink-muted">เพื่อรับ QR และยอดที่ต้องจ่าย</p>
  </div>
)}
```

- [ ] **Step 4: Verify build + unit**

Run: `npm run check`
Expected: PASS (zero errors). Confirm the canonical fixture and `promptpay` tests still green.

- [ ] **Step 5: Commit**

> Note: `PeerBill.tsx` needs `useRef` added to its `react` import.

```bash
git add src/app/b/[id]
git commit -m "feat(peer): payback panel + tap-to-claim (design C+)"
```

---

## Definition of Done

```
npm run check
```
Zero errors, all tests green. Plus:
- `src/lib/billing/promptpay.ts` covered by golden-vector tests (dynamic + static); canonical Katsu fixture still green.
- Peer flow verified on a mobile viewport (390×844): tapping a name in "ทุกคน" reveals the top panel and auto-scrolls to it; the pre-claim prompt shows; QR renders; copy-amount + copy-number work (incl. in-app-browser clipboard fallback) with the "คัดลอกแล้ว ✓" feedback; ฿0 peer shows "ไม่มียอดต้องจ่าย" (no controls); bank fallback shows when no PromptPay ID; claim persists across reload.
- Profile page (`/profile`): fields autosave; static QR preview appears for a valid PromptPay ID.
- One **real bank-app scan** of a generated QR confirms the correct amount pre-fills (QA, ADR-0008/0009).
- `docs/STATUS.md` updated (phase/roadmap: #10 done); delete this plan once merged.

## Impact notes (ADR-0006 anon door)

`get_bill` is the only anon read path and is rebuilt in Task 2 — verify anon peers still load open/locked bills and that no payment column beyond the four typed fields is exposed. No new anon write path is added (paid flag unchanged from #9).
