# UI Polish (critique fix-all) Implementation Plan

**Issue:** #15
**Goal:** Fix all 11 findings from the 2026-07-19 critique (`.impeccable/critique/2026-07-19T13-27-34Z__src-app.md`): 2 P1 + 3 P2 + 6 P3, plus the agreed kebab-menu pattern for delete actions.
**Architecture:** Visual/interaction-only branch `feat/15-ui-polish` off `main`. No schema, no RPC, no billing-logic changes. One new shared component (`KebabMenu`), one shared-dialog refactor, two `loading.tsx` route files. All colors from existing tokens in `src/app/globals.css`.

## Global Constraints (from CLAUDE.md)

- Do NOT modify things not asked for.
- No money arithmetic in components; satang integers, `formatSatang` at display edge only.
- Peers stay login-free; nothing here touches access modes.
- Supabase stays source of truth; no new client shadow state.
- Mobile 390 AND desktop both first-class; Thai copy; min 12px font; AA contrast (the 3.1:1 white-on-primary deviation stays accepted, do not "fix" it).
- No em dashes in UI copy.
- Conventional commits, subject < 50 chars. Semi-linear git: branch off main, `--no-ff` merge, never squash.
- DoD: `npm run check` zero errors; peer flows verified at 390×844.

## File Map

| File | Change |
|---|---|
| `src/components/KebabMenu.tsx` | NEW: accessible ⋯ popover menu (native, no lib) |
| `src/components/ConfirmDialog.tsx` | center fix (`m-auto`), color transition fix |
| `src/app/dashboard/BillList.tsx` | single shared ConfirmDialog, delete-target state |
| `src/app/dashboard/BillListItem.tsx` | 3-state badge + icons + nowrap, ✕ → KebabMenu, uniform row width |
| `src/app/bills/[id]/BillEditor.tsx` | header hierarchy (copy-link primary, delete → kebab), checksum section neutral empty state + Thai label + saved-cue, transitions |
| `src/app/bills/[id]/MatrixView.tsx` | drop duplicate checksum footer line, Thai label, transitions |
| `src/app/bills/[id]/CardsView.tsx` | sticky bar Thai label + neutral empty state, transitions |
| `src/app/b/[id]/PeerBill.tsx` | visible idle tick/paid cells, locked-vs-idle distinction, transitions |
| `src/app/bills/[id]/loading.tsx` | NEW: editor route skeleton |
| `src/app/b/[id]/loading.tsx` | NEW: peer route skeleton |
| `src/app/dashboard/loading.tsx` | NEW: dashboard skeleton |

Convention change (documented in the `globals.css` comment block): press/hover feedback classes become `transition active:scale-95` (Tailwind default `transition` covers colors + transform), replacing `transition-transform` and `transition-[transform,background-color,color]` everywhere they were added in PR #22.

---

### Task 1: KebabMenu component + dashboard row integration (items: kebab decision, 3, 7-edge, 8)

**Files:** create `src/components/KebabMenu.tsx`; modify `src/app/dashboard/BillListItem.tsx`, `src/app/dashboard/BillList.tsx`

**Steps:**

- [ ] **1.1 Create `KebabMenu.tsx`** — button with `aria-haspopup="menu"` + `aria-expanded`, absolutely-positioned right-aligned menu panel, closes on outside click and Escape:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** ⋯ overflow menu for row/header actions. Items render inside; each item
 *  should call the provided close() when activated. */
export default function KebabMenu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition hover:bg-surface-tint active:scale-95 focus-visible:outline-2 focus-visible:outline-primary-ink"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-40 rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
```

Menu item convention (used by callers, not a component):
`className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm transition hover:bg-surface-tint active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"` plus `text-danger` for destructive entries; `role="menuitem"`.

- [ ] **1.2 `BillListItem.tsx`: replace the ✕ button with KebabMenu on EVERY row** (locked included — uniform right edge, fixes jagged alignment):

```tsx
<KebabMenu label={`ตัวเลือกบิล ${bill.restaurant || "ยังไม่มีชื่อร้าน"}`}>
  {(close) =>
    bill.status === "locked" ? (
      <button type="button" role="menuitem" disabled className="...convention + text-danger">
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
        className="...convention + text-danger"
      >
        ลบบิล
      </button>
    )
  }
</KebabMenu>
```

- [ ] **1.3 Lift ConfirmDialog out of the row (item 8):** `BillListItem` loses its dialog + `confirmOpen`/`deleting` state and gains `onRequestDelete: (bill: BillSummary) => void`. `BillList.tsx` owns ONE dialog:

```tsx
const [deleteTarget, setDeleteTarget] = useState<BillSummary | null>(null);
const [deleting, setDeleting] = useState(false);
const [error, setError] = useState<string | null>(null);

async function onConfirmDelete() {
  if (!deleteTarget || deleting) return;
  setDeleting(true);
  setError(null);
  try {
    await deleteBill(deleteTarget.id);
    setBills((prev) => prev.filter((b) => b.id !== deleteTarget.id));
    setDeleteTarget(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
  } finally {
    setDeleting(false);
  }
}
```

Dialog message keeps the shared-bill warning branch on `deleteTarget?.status === "open"`. Error renders once under the list, `role="alert"`.

- [ ] **1.4 3-state badge with icons + nowrap (items 3, 7):**

```tsx
{bill.status === "open" ? (
  <span className="whitespace-nowrap rounded-full bg-success px-3 py-1 text-sm font-bold text-white">✓ เปิดแล้ว</span>
) : bill.status === "locked" ? (
  <span className="whitespace-nowrap rounded-full bg-ink-muted px-3 py-1 text-sm font-bold text-white">🔒 ล็อกแล้ว</span>
) : (
  <span className="whitespace-nowrap rounded-full bg-surface-tint px-3 py-1 text-sm font-medium text-primary-ink">ฉบับร่าง</span>
)}
```

Also `whitespace-nowrap` on the date span.

- [ ] **1.5 Run `npm run check`; commit** `fix(dashboard): kebab menu, locked badge, one dialog`

### Task 2: ConfirmDialog centering (item 2)

**Files:** `src/components/ConfirmDialog.tsx`

- [ ] **2.1** Add `m-auto` to the dialog className (Tailwind preflight zeroes margins, killing native `<dialog>` auto-centering once `open:flex` applies). Also swap its buttons' `transition-transform` → `transition`.
- [ ] **2.2** Verify in browser at 390 and 1200: dialog centered both axes. Commit `fix(ui): center confirm dialog`.

### Task 3: Editor header hierarchy (item 6)

**Files:** `src/app/bills/[id]/BillEditor.tsx`

- [ ] **3.1** Open-state header becomes: `✓ เปิดแล้ว` pill (with icon, item 7) · **คัดลอกลิงก์ = solid primary** (`bg-primary text-white hover:bg-primary-deep`, keeps `คัดลอกลิงก์แล้ว ✓` swap) · ดูหน้าเพื่อน stays outlined · **ลบบิล moves into `<KebabMenu label="ตัวเลือกบิล">`** (danger menuitem, hidden entirely when locked, opens the existing confirm dialog). Draft-state header: เปิดบิล · Publish stays primary; ลบบิล also moves into kebab.
- [ ] **3.2** `npm run check`; browser check 390 (header no longer wraps to a lonely delete row) + 1200. Commit `fix(editor): share primary, delete in menu`.

### Task 4: Peer page idle cells visible (item 1)

**Files:** `src/app/b/[id]/PeerBill.tsx`

- [ ] **4.1** Desktop matrix tick cells, idle state: replace `bg-surface-tint text-transparent` with a visible affordance and make locked visually distinct from idle:

```tsx
className={`h-10 w-10 rounded-lg border text-lg font-bold transition active:scale-95 disabled:cursor-not-allowed ${
  ticked
    ? "border-transparent bg-primary text-white hover:bg-primary-deep"
    : "border-border bg-surface text-ink-muted/40 hover:border-primary hover:bg-surface-tint"
} ${locked || pending ? "opacity-40" : ""}`}
```

(✓ glyph now faintly visible when idle; border signals tappable; locked dims the whole cell instead of hiding affordance.)

- [ ] **4.2** Same treatment for the จ่ายแล้ว row cells (paid uses `bg-success`; idle same faint-✓-with-border pattern; paid cells never get the `locked` dim since paid stays live).
- [ ] **4.3** Mobile chip list: chips already show names (fine), but apply the locked-dim consistency: keep current behavior, just ensure `disabled` styling comes from the locked flag, not `opacity-50` alone.
- [ ] **4.4** Replace all `transition-[transform,background-color,color]` in this file with `transition` (item 9).
- [ ] **4.5** `npm run check`; browser: /b/[id] at 1200 — idle cells clearly tappable; lock via editor NOT toggled (don't touch ล็อกบิล). Commit `fix(peer): visible idle cells, lock dim`.

### Task 5: Checksum language + neutral empty state + dedupe (items 4, 10)

**Files:** `src/app/bills/[id]/BillEditor.tsx`, `MatrixView.tsx`, `CardsView.tsx`

- [ ] **5.1** Extend `receiptStatus` with a third state (display logic only, no money math):

```tsx
export function receiptStatus(receiptTotalSatang: number, checksumSatang: number) {
  if (receiptTotalSatang === 0)
    return { state: "empty" as const, label: "ยังไม่ได้กรอกยอดใบเสร็จ" };
  if (receiptTotalSatang === checksumSatang)
    return { state: "match" as const, label: "✓ ตรงกับใบเสร็จ" };
  return {
    state: "mismatch" as const,
    label: `✗ ต่างจากใบเสร็จ ${formatSatang(Math.abs(checksumSatang - receiptTotalSatang))}`,
  };
}
```

All three consumers switch from `receipt.matches ? success : danger` to:
`receipt.state === "match" ? "text-success" : receipt.state === "mismatch" ? "text-danger" : "text-ink-muted"`. Update the one existing `receiptStatus` unit test if present; otherwise add `src/app/bills/[id]/receiptStatus.test.ts`-style coverage is NOT required (component layer, post-hoc browser check acceptable).

- [ ] **5.2** Label Thai everywhere: `Checksum {formatSatang(...)}` → `ยอดรวม {formatSatang(...)}` in `CardsView.tsx:115` and `MatrixView.tsx:118` (section เช็คกับใบเสร็จ already Thai).
- [ ] **5.3** De-duplicate (item 10): in `MatrixView.tsx` footer block below the table, drop the redundant `ยอดรวม/Checksum` span (the tfoot `รวมต่อคน` row already shows the total); keep the status label + surplus note line.
- [ ] **5.4** `npm run check`; browser: fresh-ish draft bill shows muted (not red) empty state; mismatch still red. Commit `fix(editor): thai checksum copy, calm empty`.

### Task 6: Route loading states (item 5)

**Files:** create `src/app/bills/[id]/loading.tsx`, `src/app/b/[id]/loading.tsx`, `src/app/dashboard/loading.tsx`

- [ ] **6.1** Each is a server component skeleton using existing tokens, e.g. peer page:

```tsx
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl animate-pulse flex-col gap-4 p-4">
      <div className="h-8 w-56 rounded-lg bg-surface-tint" />
      <div className="h-4 w-32 rounded bg-surface-tint" />
      <div className="h-64 rounded-xl border border-border bg-surface" />
      <div className="h-40 rounded-xl border border-border bg-surface" />
    </main>
  );
}
```

(dashboard variant: header bar + 3 row-height blocks; editor variant: header + 3 section blocks. Match each page's max-w container.)

- [ ] **6.2** Browser: click bill row and ดูหน้าเพื่อน — skeleton flashes instead of frozen screen. Commit `feat(ui): route loading skeletons`.

### Task 7: Transition + saved-cue sweep (items 9, 11, 7-icons)

**Files:** `BillEditor.tssx`, `CardsView.tsx`, `MatrixView.tsx`, `PeerPicker.tsx`, `CreateBillButton.tsx`, dashboard files, `src/app/globals.css`

- [ ] **7.1** Sweep: every `transition-transform` introduced by PR #22 → `transition` (covers color+transform). Update the globals.css convention comment to say `transition active:scale-95`.
- [ ] **7.2** Saved cue (item 11): in `BillEditor`, `runMutation` success path sets `savedAt` (`Date.now()`); header renders a quiet indicator next to the back link:

```tsx
{savedAt && !saveError && (
  <span aria-live="polite" className="text-xs text-ink-muted">บันทึกแล้ว ✓</span>
)}
```

Set `savedAt` in a `.then()` on the action promise inside `runMutation` (and in the try branches of `onAddItem`/`onAddPeer`). No timers needed: the label appears after first successful save and stays (it reads "saved", which remains true until an error, which replaces it with the banner).

- [ ] **7.3** Remaining item-7 icons: editor header `เปิดแล้ว` pill → `✓ เปิดแล้ว`; peer page `เปิดอยู่` status pill gets `✓` when open, `🔒` when locked.
- [ ] **7.4** `npm run check`; commit `fix(ui): smooth transitions, saved cue, icons`.

### Task 8: Full-surface browser verification

- [ ] **8.1** 390×844 + 1200×800 sweep: dashboard (badges, kebab, dialog centered), editor draft + open (header, calm checksum, saved cue), peer page (visible cells). Screenshot each.
- [ ] **8.2** Regression: tick/untick on /b/[id] syncs to a second tab ≤2s (realtime untouched); autosave works; publish works.
- [ ] **8.3** `npm run check` final. No commit unless fixes needed.

## Definition of Done

`npm run check` — zero errors, all 52+ tests green. Peer flows verified at 390×844. Billing layer untouched (no new money math in components).

## Impact Map

Not applicable (no billing-logic or schema rows touched).
