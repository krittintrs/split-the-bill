# Calculation Breakdown Implementation Plan

**Issue:** Closes #20 (Calculation visibility) AND #34 (Calculation bug). #34's root cause
is already diagnosed and resolved via a comment
(https://github.com/krittintrs/split-the-bill/issues/34#issuecomment-5474740111: SC/VAT
typed as 100% instead of 5%/7%, not a code bug) — it was kept open only because the fix for
the underlying confusion is this UX work. Tasks 1-2 (percent-input visibility, receipt
breakdown) are #34's fix; tasks 4-5 (matrix/peer-view breakdown rows) are #20's acceptance
criteria; task 1 (the `compute.ts` breakdown fields) underpins both. One PR, closes both.

**Goal:** Make the service-charge/VAT/discount math visible everywhere a number is shown —
organizer's percent inputs, organizer's receipt-check total, both matrix tables, and the
peer's own claimed total — so nobody has to trust an opaque final figure.

**Architecture:** `computeBill()` already computes exact BigInt fractions internally and
only exposes the final ceiled numbers. This plan decomposes that pipeline into three
visible stages (subtotal → +service charge → +VAT) at both bill level and per-peer level,
exposes them as new `BillResult` fields, and wires four UI surfaces to read them. No
existing math changes — same exact fractions, same final `peerTotals`/`checksumSatang`;
this only stops discarding intermediate values the engine already derives.

Design reference (approved across several review rounds): the published mockup Artifact —
https://claude.ai/code/artifact/7d902967-61d2-4578-bf03-2ca294c89ac1

## Global Constraints (from CLAUDE.md — every task inherits these)

- All bill math lives in `src/lib/billing/` as pure functions. No money arithmetic in
  components, API routes, or the DB.
- Money is integer satang everywhere. Convert to ฿ only at the display edge
  (`formatSatang`). Never float arithmetic on money.
- Peer-facing screens require no login and must work one-handed on a phone AND
  comfortably on desktop — neither is "the enhancement."
- `src/lib/billing/` changes are TDD-mandatory: failing test → implement → verify green.
  The canonical Katsu CSV fixture (`compute.test.ts`, "canonical Katsu fixture" describe
  block) must stay green throughout — its `peerTotals`/`checksumSatang` are locked and
  must not change, since this plan only exposes new fields, never changes existing ones.
- Component/UI changes: post-implementation testing is acceptable (no TDD mandate).
- No em dashes in UI copy. Minimum 12px font. Amounts render as `฿1,234.50`.
- Do not modify anything not asked for. In particular: do **not** touch `itemShareSatang()`
  in `src/lib/billing/itemShare.ts` or the "รายการ" items card in `PeerBill.tsx` — both stay
  exactly as they are. The new peer breakdown sources from `computeBill()`'s new
  `peerBreakdowns` field, not from `itemShareSatang`.
- Do not touch #33 (rounding/remainder absorption) — separate, already-tracked work.

## File Map

| File | Change |
|---|---|
| `src/lib/billing/types.ts` | Add `subtotalSatang`, `serviceChargeSatang`, `vatSatang` to `BillResult`; add `peerBreakdowns: Record<string, PeerBreakdown>` |
| `src/lib/billing/compute.ts` | Decompose the single `billLevelMultiplier` pass into staged discount → SC → VAT accumulation, per peer and at bill level; residual rounding so lines always sum exactly to the total |
| `src/lib/billing/compute.test.ts` | New assertions for the four new fields, plus one against the canonical Katsu fixture |
| `src/app/bills/[id]/BillEditor.tsx` | (A) percent inputs get a permanent "%" suffix + quick-fill chips; (B) เช็คกับใบเสร็จ gets a stacked-line breakdown |
| `src/app/bills/[id]/MatrixView.tsx` | (C) footer rows for Service charge / VAT (always) and ส่วนลด (conditional) before "รวมต่อคน" |
| `src/app/b/[id]/PeerBill.tsx` | (D) desktop matrix gets the same footer rows as (C); mobile "ทุกคน" list appends a breakdown to only the claimed peer's own row |

No `IMPACT-MAP` file exists in this repo — this section intentionally omitted.

## Tasks

### Task 1 — `src/lib/billing/`: expose subtotal / SC / VAT, bill-level and per-peer

TDD. Write the failing tests first, then make them pass, then confirm the canonical
fixture is still green.

**1a. Extend the type.**

```ts
// src/lib/billing/types.ts
export interface PeerBreakdown {
  /** Their exact item-share subtotal, after item AND bill discounts, before any charge. */
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
}

export interface BillResult {
  peerTotals: Record<string, number>;
  checksumSatang: number;
  receiptTotalSatang: number;
  surplusSatang: number;
  itemSplits: Record<string, Record<string, number>>;
  untickedItemIds: string[];
  /** Bill-level breakdown. subtotalSatang + serviceChargeSatang + vatSatang === receiptTotalSatang exactly. */
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  /** Per peer. Each entry's three fields sum exactly to peerTotals[peerId]. */
  peerBreakdowns: Record<string, PeerBreakdown>;
}
```

**1b. Failing tests** (append to `compute.test.ts`):

```ts
describe("breakdown fields (subtotal / SC / VAT, bill-level and per-peer)", () => {
  it("bill-level breakdown sums exactly to receiptTotalSatang, no SC/VAT", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 30000, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
    });
    expect(r.subtotalSatang).toBe(30000);
    expect(r.serviceChargeSatang).toBe(0);
    expect(r.vatSatang).toBe(0);
    expect(r.subtotalSatang + r.serviceChargeSatang + r.vatSatang).toBe(r.receiptTotalSatang);
  });

  it("bill-level breakdown with 5% SC + 7% VAT (the #34 example bill)", () => {
    // ค่าข้าว 5555.00 + Soju 510.00 = 6065.00 subtotal
    const r = computeBill({
      items: [
        { id: "katao", unitPriceSatang: 555500, qty: 1, tickedBy: ["a", "b", "c", "d", "e"] },
        { id: "soju", unitPriceSatang: 51000, qty: 1, tickedBy: ["a"] },
      ],
      peerIds: ["a", "b", "c", "d", "e"],
      serviceChargePercent: 5,
      vatPercent: 7,
    });
    expect(r.subtotalSatang).toBe(606500);
    expect(r.serviceChargeSatang).toBe(30325); // 6065.00 × 5% = 303.25
    // vatSatang is the residual line: total − subtotal − SC, so the three always sum exactly
    expect(r.subtotalSatang + r.serviceChargeSatang + r.vatSatang).toBe(r.receiptTotalSatang);
    expect(r.receiptTotalSatang).toBe(681403); // ceil(6065 × 1.05 × 1.07) = 6814.03 (see mockup)
  });

  it("per-peer breakdown sums exactly to that peer's peerTotals entry", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 10,
      vatPercent: 7,
    });
    for (const id of ["a", "b", "c"]) {
      const b = r.peerBreakdowns[id];
      expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
    }
  });

  it("per-peer breakdown reconciles across the full-pipeline integration fixture", () => {
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 10000, qty: 2, discountPercent: 10, tickedBy: ["A", "B"] },
        { id: "i2", unitPriceSatang: 15000, qty: 1, discountAmountSatang: 500, tickedBy: ["B"] },
      ],
      peerIds: ["A", "B"],
      billDiscount: { percent: 10, amountSatang: 250 },
      serviceChargePercent: 10,
      vatPercent: 7,
    });
    for (const id of ["A", "B"]) {
      const b = r.peerBreakdowns[id];
      expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
    }
    expect(r.peerTotals).toEqual({ A: 9453, B: 24681 }); // unchanged from the existing test
  });

  it("canonical Katsu fixture: breakdown fields exist, peerTotals/checksum unchanged", () => {
    const katsu: BillInput = {
      items: [
        { id: "katsu", unitPriceSatang: 15900, qty: 1, discountPercent: 10, tickedBy: ["D"] },
        { id: "cheesy-don", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["A"] },
        { id: "chicken-don", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: ["B"] },
        { id: "add-on-59", unitPriceSatang: 5900, qty: 1, discountPercent: 10, tickedBy: ["B"] },
        { id: "add-on-89", unitPriceSatang: 8900, qty: 1, discountPercent: 10, tickedBy: ["E"] },
        { id: "a-la-carte-loin", unitPriceSatang: 14900, qty: 1, discountPercent: 10, tickedBy: ["E"] },
        { id: "chicken-katsu-set", unitPriceSatang: 19900, qty: 1, discountPercent: 10, tickedBy: ["C"] },
      ],
      peerIds: ["A", "B", "C", "D", "E"],
      serviceChargePercent: 0,
      vatPercent: 0,
    };
    const r = computeBill(katsu);
    expect(r.peerTotals).toEqual({ A: 17910, B: 18720, C: 17910, D: 14310, E: 21420 });
    expect(r.checksumSatang).toBe(90270);
    expect(r.serviceChargeSatang).toBe(0);
    expect(r.vatSatang).toBe(0);
    for (const id of ["A", "B", "C", "D", "E"]) {
      const b = r.peerBreakdowns[id];
      expect(b.subtotalSatang).toBe(r.peerTotals[id]); // no SC/VAT on this fixture
      expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
    }
  });
});
```

Run, confirm every new test fails (function doesn't return these fields yet):

```bash
npm run test -- compute.test.ts
```

**1c. Implement.** Replace the single-multiplier step 4-6 in `computeBill` with staged
per-peer accumulation. Residual rounding: the **last** stage in a chain absorbs whatever
satang the ceil'd earlier stages didn't account for, so the displayed lines always sum
exactly to the displayed total — never let each stage round independently and then not
add up.

```ts
// src/lib/billing/compute.ts — replace steps 4-6 with:

// 4. Per-peer subtotal: item shares (after item + bill discounts), exact, no charges yet.
const peerSubtotalFractions = new Map<string, Fraction>(
  input.peerIds.map((id) => [id, ZERO]),
);
const itemSplits: Record<string, Record<string, number>> = {};
const untickedItemIds: string[] = [];

for (const item of input.items) {
  itemSplits[item.id] = {};
  if (item.tickedBy.length === 0) {
    untickedItemIds.push(item.id);
    continue;
  }
  const netPrice = netPrices.get(item.id)!;
  const perTickerShare = multiply(
    fraction(netPrice.numerator, netPrice.denominator * BigInt(item.tickedBy.length)),
    billDiscountRatio,
  );
  for (const peerId of item.tickedBy) {
    peerSubtotalFractions.set(peerId, add(peerSubtotalFractions.get(peerId)!, perTickerShare));
  }
}

const scRatio = fraction(BigInt(100 + input.serviceChargePercent), 100n);
const vatRatio = fraction(BigInt(100 + input.vatPercent), 100n);

// 5. Stage each peer through subtotal → +SC → +VAT, ceiling once per stage; VAT is the
//    residual so the three displayed lines always sum exactly to the final total.
const peerTotals: Record<string, number> = {};
const peerBreakdowns: Record<string, PeerBreakdown> = {};
let checksumSatang = 0;

for (const [peerId, subtotalExact] of peerSubtotalFractions) {
  const withScExact = multiply(subtotalExact, scRatio);
  const withVatExact = multiply(withScExact, vatRatio);

  const subtotalSatang = ceilToSatang(subtotalExact);
  const scSatang = ceilToSatang(withScExact) - subtotalSatang;
  const total = ceilToSatang(withVatExact);
  const vatSatang = total - subtotalSatang - scSatang;

  peerTotals[peerId] = total;
  peerBreakdowns[peerId] = { subtotalSatang, serviceChargeSatang: scSatang, vatSatang };
  checksumSatang += total;

  // itemSplits stays display-only per item, unchanged — recompute per item using
  // the same billDiscountRatio × scRatio × vatRatio chain, ceil'd per cell (existing behavior).
}
// (itemSplits population loop stays as it was, just multiplying by
//  billDiscountRatio × scRatio × vatRatio instead of the old single billLevelMultiplier —
//  same exact fraction, associativity holds.)

// 6. Bill-level breakdown, same residual convention as each peer.
const subtotalExactBill = subtotal.numerator > 0n ? multiply(subtotal, billDiscountRatio) : ZERO;
const withScExactBill = multiply(subtotalExactBill, scRatio);
const withVatExactBill = multiply(withScExactBill, vatRatio);
const subtotalSatang = ceilToSatang(subtotalExactBill);
const serviceChargeSatang = ceilToSatang(withScExactBill) - subtotalSatang;
const receiptTotalSatang = ceilToSatang(withVatExactBill);
const vatSatang = receiptTotalSatang - subtotalSatang - serviceChargeSatang;
```

Adjust variable names/order to fit the existing function body — the point is the staged
`subtotal → ×scRatio → ×vatRatio` chain replacing the single `billLevelMultiplier`, with
`ceilToSatang` applied once per stage and the **last** stage (VAT) computed as a residual
subtraction so rounding never breaks the sum. Keep `itemSplits`'s per-cell math using the
equivalent combined ratio (`billDiscountRatio × scRatio × vatRatio`) so its values are
byte-for-byte unchanged from before this refactor.

Run:

```bash
npm run test -- compute.test.ts
```

All new tests green, all pre-existing tests still green (peerTotals/checksum/receiptTotal
untouched). Then:

```bash
npm run check
```

Commit: `feat(billing): expose subtotal/SC/VAT breakdown, bill and per-peer (#20)`

---

### Task 2 — BillEditor.tsx: percent inputs get a "%" suffix + quick-fill chips

No TDD mandate (component work). Manual verification after.

- Wrap each percent `<input>` (`ส่วนลดบิล %`, `Service charge %`, `VAT %`, and the per-item
  `ลด %` column) in a `relative` container with an absolutely-positioned `%` span, always
  visible (not a placeholder). Reuse the same `.box`/suffix pattern for all four fields —
  one visual language, not four one-offs.
- Under **Service charge %** only: two small chips, "5%" and "10%". Under **VAT %** only:
  one chip, "7%" (Thailand's statutory rate). Clicking a chip calls the same `saveBill`
  path as typing the value directly (`onClick={() => saveBill({ service_charge_percent: 5 })}`,
  etc.) — still fully editable afterward, chips are a shortcut, not a lock.
- No warning border, no blocking, no threshold check. Rejected in design review — the
  receipt-check breakdown (Task 3) is what surfaces an unusual value, not the input itself.

Verify manually: type into each field, confirm "%" stays visible; click each chip, confirm
the field updates and autosaves (existing `onBlur`/`saveBill` wiring, unchanged).

Commit: `feat(editor): persistent % suffix + SC/VAT quick-fill chips (#20)`

---

### Task 3 — BillEditor.tsx: เช็คกับใบเสร็จ gets a stacked breakdown

- Replace the single `ระบบคำนวณได้ {formatSatang(result.checksumSatang)}` line with:
  - `รวมรายการ {formatSatang(result.subtotalSatang)}`
  - `+ Service charge {bill.service_charge_percent}% {formatSatang(result.serviceChargeSatang)}`
    — only when `bill.service_charge_percent > 0`
  - `+ VAT {bill.vat_percent}% {formatSatang(result.vatSatang)}` — only when
    `bill.vat_percent > 0`
  - `รวม {formatSatang(result.receiptTotalSatang)}` (final line, bold)
- Stacked lines (each on its own row, `flex justify-between`), not an arrow chain.
- Keep the existing `ระบบคำนวณได้` label off — the breakdown's final line replaces it. Keep
  the existing ✓/✗ `receiptStatus` line exactly as it is, unchanged, below the breakdown.
- No mention of #33 or the rounding surplus in this copy.

Verify manually against the mockup's numbers (SC 5%, VAT 7%, ค่าข้าว + Soju bill): breakdown
lines match `฿6,065.00 → +303.25 → +445.78 → ฿6,814.03`.

Commit: `feat(editor): stacked cost breakdown in receipt-check section (#20)`

---

### Task 4 — MatrixView.tsx: footer rows for Service charge / VAT / (conditional) discount

- Insert new `<tr>` rows in `<tfoot>`, before the existing "รวมต่อคน" row:
  - **ส่วนลด** row: only when `bill.bill_discount_percent > 0 || bill.bill_discount_satang > 0`
    or any item has `discount_percent > 0 || discount_satang > 0`. Per-peer cell = their
    share of the total discount amount (derive from `result.peerBreakdowns` — a peer's
    pre-discount item total minus their `subtotalSatang`, or expose this directly from
    Task 1 if cleaner; use judgment, covered by Task 1's tests either way).
  - **Service charge** row: `result.serviceChargeSatang` in the ฿ column; per-peer cells
    from `result.peerBreakdowns[peer.id].serviceChargeSatang`. Always rendered (even at 0%,
    matching the existing unconditional "รวมต่อคน" row style) — only the discount row is
    conditional, per design review.
  - **VAT** row: same pattern, `vatSatang`.
- Existing "รวมต่อคน" row (`result.peerTotals`) stays last, unchanged.

Verify manually on the `/bills/[id]` desktop matrix with the mockup's example bill.

Commit: `feat(matrix): SC/VAT footer rows, conditional discount row (#20)`

---

### Task 5 — PeerBill.tsx: same footer rows on desktop, claimed-row breakdown on mobile

**Desktop** (the `matrixView` table already in this file, rendered at `lg:`+): apply the
identical footer-row treatment from Task 4 to this table's `<tfoot>`, before "ยอดต่อคน".

**Mobile** (`everyoneSection`, rendered at `<lg`): do not touch `itemsSection` ("รายการ") at
all. In `everyoneSection`, for the row where `isClaimed` is true only, append a breakdown
block under the existing name/amount row:

```tsx
{isClaimed && (
  <div className="mt-1 flex flex-col gap-0.5 border-t border-dashed border-border pt-1 text-xs text-ink-muted">
    <div className="flex justify-between">
      <span>รวมของคุณ</span>
      <b className="text-ink">{formatSatang(result.peerBreakdowns[peer.id].subtotalSatang)}</b>
    </div>
    {result.peerBreakdowns[peer.id].serviceChargeSatang > 0 && (
      <div className="flex justify-between">
        <span>+ Service charge</span>
        <b className="text-ink">{formatSatang(result.peerBreakdowns[peer.id].serviceChargeSatang)}</b>
      </div>
    )}
    {result.peerBreakdowns[peer.id].vatSatang > 0 && (
      <div className="flex justify-between">
        <span>+ VAT</span>
        <b className="text-ink">{formatSatang(result.peerBreakdowns[peer.id].vatSatang)}</b>
      </div>
    )}
  </div>
)}
```

Always visible on that one row — no expand/collapse. It is scoped to exactly one peer (the
one looking at their own phone), not all peers, so there is no list-length problem to hide
behind an accordion. Do not add this to the organizer's self-peer row branch (lines ~303-327)
— that row has no debt to explain.

Verify manually on `/b/[id]` at a mobile viewport: claim a peer, confirm the breakdown
appears only on their row and sums to the amount already shown in `PaybackControls`.

Commit: `feat(peer-view): matrix footer rows + claimed-row breakdown (#20)`

---

## Definition of Done

```bash
npm run check
```

Zero errors, all tests green (lint + typecheck + vitest). Plus:

- [ ] Canonical Katsu fixture still reproduces `A: 17910, B: 18720, C: 17910, D: 14310, E: 21420`, checksum `90270`
- [ ] Every new `peerBreakdowns[id]` entry sums exactly (in satang) to `peerTotals[id]`, for every existing test bill including the full-pipeline integration fixture
- [ ] Bill-level `subtotalSatang + serviceChargeSatang + vatSatang === receiptTotalSatang` always
- [ ] Peer-facing flows (mobile claimed-row breakdown, mobile item ticking) verified on a mobile viewport, not just desktop
- [ ] `docs/STATUS.md` updated: #20 and #34 both move to DONE, version bumped
- [ ] PR body / merge commit closes both issues (`Closes #20, #34`)
- [ ] This file deleted once the PR merges (disposable plan, per CLAUDE.md file lifecycle)
