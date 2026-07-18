# PLAN: Issue #19 — Bad UX (feedback, nav, delete)

Disposable execution plan. Delete once work is verified merged.

Scope: issue #19 items #1-3 only. Item #4 (create-flow rework) is tracked separately in #21.

## 1. Shared UI primitives (new `src/components/`)

- `ConfirmDialog.tsx` — minimal modal using native `<dialog>`, no library. Props: title, message, confirm label, cancel label, onConfirm. Used for bill delete.
- `Spinner.tsx` — small inline spinner for buttons/page transitions.
- Button interaction feedback is handled via shared Tailwind utility classes (not a new component) — see #4.

## 2. Loading/visual feedback

- **Dashboard bill list** (`src/app/dashboard/page.tsx`): wrap each bill card link in a small client component using `useTransition` + `router.push`, so the card visibly dims/shows a spinner and further clicks are disabled while the route transition is pending.
- **BillEditor autosave errors** (`BillEditor.tsx:50-53`): replace `alert(...) + window.location.reload()` with an inline error banner + manual retry action. No forced reload.
- No pending states added to individual mutations beyond the two spots above (add/update line item, peer add/remove, publish stay as-is).

## 3. Nav button: editor → peer viewer

- Add `<Link href={`/b/${bill.id}`}>` next to the existing copy-link button in `BillEditor.tsx` header (~line 166-179). Same-tab navigation.

## 4. Global button hover/active feedback

- Audit all interactive buttons across `BillEditor.tsx`, `PeerBill.tsx`, `CreateBillButton.tsx`, dashboard cards, new delete/nav buttons.
- Establish one consistent Tailwind pattern for all buttons (add to `tailwind.config.ts`/`globals.css` as the shared convention, per project's design-token rule):
  - Hover: slight background/color shift (e.g. `hover:bg-*-600` one shade darker, or `hover:opacity-90`).
  - Active/click: slight scale down (e.g. `active:scale-95`) plus color shift, so a tap on mobile visibly registers.
  - Keep existing `disabled:opacity-50` / `focus-visible:outline-2` states, layer the new hover/active states on top.
- Applies retroactively to existing buttons, not just newly-added ones (copy-link, publish, tick/paid/lock buttons in `PeerBill.tsx`, create-bill button).

## 5. Delete bill (hard delete + confirm dialog)

- New `deleteBill(billId)` in `src/lib/bills/mutations.ts`, following existing `fail()`-throwing pattern: `supabase.from("bills").delete().eq("id", billId)`. DB cascade (`ON DELETE CASCADE`) already covers `line_items`, `bill_peers`, `ticks` — no extra cleanup code needed.
- **Delete eligibility rule:** only allowed when `bill.status !== "locked"`.
  - `status === "draft"` (not yet published): delete allowed, warning dialog ("This bill will be permanently deleted.").
  - `status === "open"` (published, not locked): delete allowed, but warning dialog must call out that peers may have already ticked/paid items and that history will be lost ("This bill has been shared and peers may have marked items. Deleting it removes all their progress permanently.").
  - `status === "locked"`: delete action hidden/disabled entirely (not just blocked on click) — locked implies settlement is final.
- Delete button + `ConfirmDialog` wired in **both**:
  - Dashboard bill card (`dashboard/page.tsx`) — per-row delete, hidden for locked bills.
  - `BillEditor.tsx` header — delete-this-bill, hidden/disabled for locked bills.
- On confirm: call `deleteBill`, then redirect to `/dashboard` (from editor) or remove the row from the list (from dashboard).

## Definition of done

- `npm run check` passes.
- Peer-facing flows (button feedback, nav) verified on mobile viewport per DoD.
- No bill-math/`src/lib/billing/` changes involved — no TDD mandate applies here (this is UI/UX only).
