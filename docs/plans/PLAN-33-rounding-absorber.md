# Rounding Absorber Implementation Plan

**Issue:** [#33](https://github.com/krittintrs/split-the-bill/issues/33) — "round to which person to make total amount tied with actual bill"
**Goal:** the checksum (sum of peer totals) ties the receipt total exactly whenever every item is ticked, by resolving rounding in two tiers instead of one flat ceiling per peer: each item's own leftover goes to a ticker of *that item*, and any bill-wide gap left over (from item-ceiling overshoot or SC/VAT compounding) goes to one named bill-level peer.
**Architecture:** see [ADR-0011](../adr/0011-rounding-absorber-peer.md) (refines [ADR-0001](../adr/0001-integer-satang-round-up.md)) for the full rationale. Summary: `LineItemInput` gains `roundingAbsorberPeerId?: string` (per item); `BillInput` keeps one at the bill level too (for the SC/VAT-stage residual). Every number below was verified by actually running the real engine with these changes applied as a scratch implementation, then reverted — not hand-derived. Do not re-derive them; if a number here disagrees with what your implementation produces, your implementation has a bug.

Already done in this session, before this plan: [ADR-0011](../adr/0011-rounding-absorber-peer.md) written (per-item + bill-tier hybrid), [ADR-0001](../adr/0001-integer-satang-round-up.md) amended with a pointer to it, and the finalized picker UI (leftover badge → chevron → expandable picker with a labeled shuffle option) designed and approved — see the artifact this session published for the interaction reference; recreate its visual language (rounded pill, warning-tone background, chevron rotates on open, dashed-border shuffle button with a die icon and "สุ่ม" label — no icon fonts, inline SVG only, since a published artifact can't load external icon-font CDNs; the real app should use whatever icon library it already has installed, e.g. lucide-react's `ChevronDown`/`Shuffle`, not literally inline SVG).

## Global Constraints (from CLAUDE.md)

- Do not modify anything not asked for — the unticked-item shortfall path and bill/item discount math must produce byte-identical results to today (verified: every existing test with a single-ticker item, or with an already-integer split, is untouched — only tests with a fractional multi-ticker split change).
- All bill math stays in `src/lib/billing/` as pure functions. No money arithmetic in components or API routes.
- Money is integer satang everywhere; never float arithmetic on money.
- Peers get capability-URL access only — the absorber pickers are organizer-only; peers never mutate either field, they just see the resulting correct totals.
- Supabase is the single source of truth — both the per-item and bill-level absorber choices must persist and be read back identically by the organizer's editor and the peer link (`/b/[id]`).
- Responsive: both pickers must work one-handed on mobile and on desktop.
- `src/lib/billing/` changes are TDD: failing test → implement → green. The canonical Katsu CSV fixture (`A=179.10, B=187.20, C=179.10, D=143.10, E=214.20`, checksum `902.70`) must be reproduced exactly — verified unaffected, because every item in that fixture has exactly one ticker (the new algorithm provably degenerates to the old per-item ceiling when `tickedBy.length === 1`).

## File Map

| File | Change |
|---|---|
| `src/lib/billing/fraction.ts` | Add `floorToSatang(value: Fraction): number`. |
| `src/lib/billing/fraction.test.ts` | Add tests for `floorToSatang`. |
| `src/lib/billing/types.ts` | Add `roundingAbsorberPeerId?: string` to both `LineItemInput` and `BillInput`. Update the `itemSplits` doc comment on `BillResult` — it's no longer "display only, may sum above peerTotal"; for any ticked item it now sums exactly to that item's own ceil'd cost. |
| `src/lib/billing/compute.ts` | Full rewrite of the item-share loop and the peer-total stage — see Task 2. |
| `src/lib/billing/compute.test.ts` | Update the 6 tests whose expected numbers change (all verified below); add tests for cross-item independence, per-item override/fallback, bill-level override/fallback, and the non-negative-VAT-residual regression. |
| `supabase/migrations/20260831000000_rounding_absorber.sql` | Add `rounding_absorber_peer_id` to **both** `line_items` and `bills`; reissue `get_bill()` to return both. |
| `src/lib/bills/types.ts` | Add `rounding_absorber_peer_id: string | null` to both `LineItemRow` and `BillRow`. |
| `src/lib/bills/mutations.ts` | Add `"rounding_absorber_peer_id"` to both the `BillPatch` and `LineItemPatch` `Pick<...>` unions. |
| `src/lib/bills/mapper.ts` | `mapToBillInput` passes each item's `rounding_absorber_peer_id` through to `LineItemInput`, and the bill's own `rounding_absorber_peer_id ?? selfPeerId ?? undefined` through to `BillInput`. Needs a new `selfPeerId` parameter. |
| `src/app/bills/[id]/BillEditor.tsx` | Pass `selfPeerId` into `mapToBillInput`; add the bill-level picker in the "เช็คกับใบเสร็จ" section, hidden unless `result.surplusSatang !== 0` is what *would* show without a bill-level pick — see Task 5 for the precise show/hide signal (it is not "SC or VAT is nonzero"; verified the leftover can be nonzero even at 0%/0%). |
| `src/app/bills/[id]/MatrixView.tsx`, `CardsView.tsx` | Add the item-level picker per item row/card. These become mutation-capable (new `onUpdateItemAbsorber` callback prop) — they are pure display today; this is a deliberate, necessary change, not scope creep. |
| `src/app/b/[id]/PeerBill.tsx` | Add both fields to the `billInput` memo (bill-level from `bill.bill.roundingAbsorberPeerId`, per-item from each item's own field) so peers compute the identical totals the organizer sees. No UI for peers — read-only. |
| `docs/STATUS.md` | After merge: mark #33 done, add a Decision Log row citing ADR-0011. |

## The algorithm, precisely (already verified against the real engine)

**Item tier**, for every ticked item (`tickedBy.length >= 1`):

```
itemChargeableExact = netPrice(item) × billDiscountRatio          // Fraction, unchanged from today
itemTotalSatang     = ceilToSatang(itemChargeableExact)           // ADR-0001 ceiling, scoped to the item
perTickerExact      = itemChargeableExact / tickedBy.length
floorShare          = floorToSatang(perTickerExact)
itemRemainder       = itemTotalSatang − floorShare × tickedBy.length   // always 0..tickedBy.length−1

itemAbsorberId = item.roundingAbsorberPeerId, if that id IS one of item.tickedBy
                 else item.tickedBy[0]

for each peerId in tickedBy:
  share = floorShare + (peerId === itemAbsorberId ? itemRemainder : 0)
```

`peerSubtotalSatang` (a plain `Map<string, number>`, no longer a `Fraction`) accumulates `share` across every item a peer ticks. `itemSplits[item.id][peerId] = share` too — this makes `itemSplits` exact for the first time (it used to be ceil'd per cell, display-only, allowed to not sum to the peer total; now it does sum, to `itemTotalSatang`, by construction).

**Verified**: a 1-ticker item collapses to `itemAbsorberId = that ticker`, `itemRemainder = itemTotalSatang − floorShare`, i.e. exactly the old per-item ceiling. Ran the existing `"carries fractional satang exactly until the final round-up"` fixture (10001 satang, 3% discount, 1 ticker) through this formula unchanged: same `9701` result.

**Bill tier**, only when `untickedItemIds.length === 0` (unticked items keep today's ceil-per-peer path, completely untouched):

```
for each peer: withVatExact = fraction(peerSubtotalSatang) × scRatio × vatRatio
               floorTotal   = floorToSatang(withVatExact)
floorSum   = Σ floorTotal
remainder  = receiptTotalSatang − floorSum        // CAN be negative — see below, this is not a bug

billAbsorberId = input.roundingAbsorberPeerId, if that id is one of the peers
                 else input.peerIds[0]

// Guard: never let a peer's total go negative. If the chosen absorber's floor total can't
// absorb a negative remainder, fall back to whichever peer has the largest floor total.
if (remainder < 0 && floorTotal[billAbsorberId] + remainder < 0):
  billAbsorberId = peer with the largest floorTotal

for each peer: total = floorTotal + (peerId === billAbsorberId ? remainder : 0)
```

**Verified the remainder can be negative** with zero SC/VAT, purely from item-tier ceiling overshoot: two single-ticker items (a ฿10.00 item ticked by `x` alone, a ฿20.00 item ticked by `y` alone, with a bill discount producing a 2/3 ratio) each ceil independently to `667`/`1334` (sum `2001`), against a receipt of `2000` — remainder `−1`. Default absorber `x` ends up at `666`, one satang below what their own item-tier ceiling gave them. Checksum still ties (`666 + 1334 = 2000`) — the identity `absorber_total = floorTotal + remainder` holds regardless of remainder's sign; only the guard above exists to stop a peer's total going below ฿0.

## Tasks

### Task 1 — `floorToSatang` (TDD)

Same as originally scoped — add to `fraction.ts`:

```ts
/** Round DOWN to integer satang — used by the ADR-0011 rounding-absorber tiers. */
export function floorToSatang(value: Fraction): number {
  if (value.numerator < 0n) throw new Error("cannot round a negative amount");
  return Number(value.numerator / value.denominator);
}
```

Failing test first in `fraction.test.ts` mirroring the existing `ceilToSatang` block, then implement, then green.

Commit: `feat(billing): add floorToSatang for #33`

### Task 2 — `computeBill()` two-tier rounding (TDD)

Add to `types.ts`:
```ts
// LineItemInput gains:
roundingAbsorberPeerId?: string; // ADR-0011: ticker who absorbs this item's own leftover
// BillInput gains:
roundingAbsorberPeerId?: string; // ADR-0011: peer who absorbs the bill-wide leftover
```

Write these failing tests first in `compute.test.ts` (verified expected values — do not alter them):

**Update these 6 existing tests:**

1. `"rounds each peer UP: 2500 ÷ 3 → 834 each, surplus kept by organizer"` (rename, e.g. `"ties per item: 2500 ÷ 3 floors to 833 each, item's own leftover goes to its first ticker"`):
   ```ts
   expect(r.peerTotals).toEqual({ a: 834, b: 833, c: 833 });
   expect(r.checksumSatang).toBe(2500);
   expect(r.receiptTotalSatang).toBe(2500);
   expect(r.surplusSatang).toBe(0);
   ```

2. `"rounds each allocated share up, surplus goes to organizer"` (rename, e.g. `"bill-tier remainder can be negative: two single-ticker items overshoot, absorber gives one back"`):
   ```ts
   // i1 (x alone) ceils to 667, i2 (y alone) ceils to 1334 — sum 2001 vs receipt 2000.
   // Bill-tier remainder is −1; default absorber x drops from 667 to 666.
   expect(r.peerTotals).toEqual({ x: 666, y: 1334 });
   expect(r.checksumSatang).toBe(2000);
   expect(r.receiptTotalSatang).toBe(2000);
   expect(r.surplusSatang).toBe(0);
   ```

3. `"compounds after even split: 2500 ÷ 3 × 1.10 × 1.07 → 981 each"` (rename, e.g. `"item-tier ceiling compounds through SC/VAT before the bill-tier remainder lands"`):
   ```ts
   expect(r.peerTotals).toEqual({ a: 983, b: 980, c: 980 });
   expect(r.checksumSatang).toBe(2943);
   expect(r.receiptTotalSatang).toBe(2943);
   expect(r.surplusSatang).toBe(0);
   ```

4. `"per-peer breakdown reconciles across the full-pipeline integration fixture"` — update:
   ```ts
   expect(r.peerTotals).toEqual({ A: 9453, B: 24680 }); // was {A: 9453, B: 24681}
   ```

5. `"discountSatang reconciles against an independently-computed gross..."` — update the two literals:
   ```ts
   expect(a.discountSatang).toBe(1968); // was 1969
   expect(b.discountSatang).toBe(4031); // was 4030
   // r.discountSatang stays 6000 — bill-level, computed independently, untouched.
   ```

6. `"combines qty, item discounts, bill discount, SC and VAT across a shared item"` (full pipeline integration) — update:
   ```ts
   expect(r.peerTotals).toEqual({ A: 9453, B: 24680 }); // was {A: 9453, B: 24681}
   expect(r.checksumSatang).toBe(34133); // was 34134
   expect(r.receiptTotalSatang).toBe(34133);
   expect(r.surplusSatang).toBe(0); // was 1
   ```

**Add these new tests:**

```ts
it("cross-item independence: two different ticker groups each absorb their own leftover", () => {
  // item1 ฿100 ÷ A,B,C (leftover 1 → A); item2 ฿25 ÷ D,E,F (leftover 1 → D). No cross-contamination.
  const r = computeBill({
    items: [
      { id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["A", "B", "C"] },
      { id: "i2", unitPriceSatang: 2500, qty: 1, tickedBy: ["D", "E", "F"] },
    ],
    peerIds: ["A", "B", "C", "D", "E", "F"],
    serviceChargePercent: 0,
    vatPercent: 0,
  });
  expect(r.peerTotals).toEqual({ A: 3334, B: 3333, C: 3333, D: 834, E: 833, F: 833 });
  expect(r.checksumSatang).toBe(12500);
  expect(r.receiptTotalSatang).toBe(12500);
  expect(r.surplusSatang).toBe(0);
});

it("item-level roundingAbsorberPeerId overrides the default first ticker", () => {
  const r = computeBill({
    items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"], roundingAbsorberPeerId: "c" }],
    peerIds: ["a", "b", "c"],
    serviceChargePercent: 0,
    vatPercent: 0,
  });
  expect(r.peerTotals).toEqual({ a: 833, b: 833, c: 834 });
});

it("item-level absorber falls back to the first ticker when the stored id is stale", () => {
  const r = computeBill({
    items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"], roundingAbsorberPeerId: "ghost" }],
    peerIds: ["a", "b", "c"],
    serviceChargePercent: 0,
    vatPercent: 0,
  });
  expect(r.peerTotals).toEqual({ a: 834, b: 833, c: 833 });
});

it("bill-level roundingAbsorberPeerId overrides which peer takes the bill-tier remainder", () => {
  const r = computeBill({
    items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
    peerIds: ["a", "b", "c"],
    serviceChargePercent: 10,
    vatPercent: 0,
    roundingAbsorberPeerId: "c",
  });
  expect(r.peerTotals).toEqual({ a: 917, b: 916, c: 917 }); // default (no override) would be {a:918,b:916,c:916}
  expect(r.checksumSatang).toBe(2750);
});

it("never lets a non-absorber peer's VAT residual go negative (SC-only compounding, VAT 0%)", () => {
  const r = computeBill({
    items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
    peerIds: ["a", "b", "c"],
    serviceChargePercent: 10,
    vatPercent: 0,
  });
  expect(r.peerTotals).toEqual({ a: 918, b: 916, c: 916 });
  for (const id of ["a", "b", "c"]) {
    expect(r.peerBreakdowns[id].vatSatang).toBeGreaterThanOrEqual(0);
    const b = r.peerBreakdowns[id];
    expect(b.subtotalSatang + b.serviceChargeSatang + b.vatSatang).toBe(r.peerTotals[id]);
  }
});

it("negative-remainder guard: falls back to the largest-total peer rather than go negative", () => {
  // w ticks nothing (baseline 0) and is the designated bill-level absorber; three single-
  // ticker items each ceil up by ~1 satang, driving the bill-tier remainder to −2 — more
  // than w's ฿0 floor can absorb, so the guard reassigns it to the largest-floor peer instead.
  const r = computeBill({
    items: [
      { id: "i1", unitPriceSatang: 97, qty: 1, discountPercent: 1, tickedBy: ["x"] },
      { id: "i2", unitPriceSatang: 97, qty: 1, discountPercent: 1, tickedBy: ["y"] },
      { id: "i3", unitPriceSatang: 97, qty: 1, discountPercent: 1, tickedBy: ["z"] },
    ],
    peerIds: ["w", "x", "y", "z"],
    serviceChargePercent: 0,
    vatPercent: 0,
    roundingAbsorberPeerId: "w",
  });
  expect(r.peerTotals.w).toBe(0); // never negative
  expect(Object.values(r.peerTotals).every((v) => v >= 0)).toBe(true);
  expect(r.checksumSatang).toBe(r.receiptTotalSatang);
});
```

Run `npx vitest run src/lib/billing/compute.test.ts` — confirm updated/new tests fail, everything else still green, before touching `compute.ts`.

Implement per **"The algorithm, precisely"** above. The canonical Katsu fixture and every single-ticker-item test must stay byte-identical (verified already; if any of them changes, you have a bug — stop and re-check the `tickedBy.length === 1` degeneration).

**Known accepted limitation** (do not try to fully solve this — document it as a comment near the guard instead): in the pathological negative-remainder-guard scenario above, a peer's *displayed* `vatSatang` breakdown line can go negative even though their actual total never does (verified: `x`'s `vatSatang` came out `−2` in that exact test). This only happens when the bill-tier guard has to reassign a large negative adjustment onto a peer whose own item-tier subtotal is small relative to the adjustment — synthetic, not realistic for an actual lunch bill. Clamp the display value at `Math.max(0, peerVatSatang)` when rendering the breakdown in the UI (Task 5) rather than changing the underlying math; the total itself is always correct.

Commit: `feat(billing): two-tier rounding absorber, item + bill level (#33)`

### Task 3 — persist both absorber choices (migration + RPC)

`supabase/migrations/20260831000000_rounding_absorber.sql`:

```sql
-- #33 (ADR-0011): item-tier absorber on line_items, bill-tier backstop on bills.
alter table line_items add column rounding_absorber_peer_id uuid references peers (id) on delete set null;
alter table bills add column rounding_absorber_peer_id uuid references peers (id) on delete set null;

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
      'accountName', b.account_name,
      'roundingAbsorberPeerId', b.rounding_absorber_peer_id
    ),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', li.id, 'name', li.name, 'unitPriceSatang', li.unit_price_satang,
        'qty', li.qty, 'discountPercent', li.discount_percent,
        'discountSatang', li.discount_satang, 'position', li.position,
        'roundingAbsorberPeerId', li.rounding_absorber_peer_id
      ) order by li.position), '[]'::jsonb)
      from line_items li where li.bill_id = b.id
    ),
    'peers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'paidAt', bp.paid_at, 'addedAt', bp.added_at,
        'isSelf', (p.linked_user_id is not null and p.linked_user_id = b.organizer_id)
      ) order by bp.added_at, p.id), '[]'::jsonb)
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

Apply with the global Supabase CLI (never `npx supabase`), then `supabase db push` and verify.

Commit: `feat(db): add rounding_absorber_peer_id to line_items + bills (#33)`

### Task 4 — wire the app layer

`src/lib/bills/types.ts`: add `rounding_absorber_peer_id: string | null` to both `LineItemRow` and `BillRow`.

`src/lib/bills/mutations.ts`: add `"rounding_absorber_peer_id"` to both `BillPatch`'s and `LineItemPatch`'s `Pick<...>` unions, so `updateBill(billId, { rounding_absorber_peer_id })` and `updateLineItem(itemId, { rounding_absorber_peer_id })` both type-check.

`src/lib/bills/mapper.ts`: `mapToBillInput` needs a `selfPeerId` parameter (for the bill-level default) and passes each item's own column through:
```ts
export function mapToBillInput(
  bill: BillRow,
  items: LineItemRow[],
  peers: PeerRow[],
  ticks: TickRow[],
  selfPeerId: string | null,
): BillInput {
  // ...unchanged tickedByItem construction...
  return {
    items: [...items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        unitPriceSatang: item.unit_price_satang,
        qty: item.qty,
        discountPercent: item.discount_percent,
        discountAmountSatang: item.discount_satang,
        tickedBy: tickedByItem.get(item.id) ?? [],
        roundingAbsorberPeerId: item.rounding_absorber_peer_id ?? undefined,
      })),
    peerIds: peers.map((peer) => peer.id),
    billDiscount: { percent: bill.bill_discount_percent, amountSatang: bill.bill_discount_satang },
    serviceChargePercent: bill.service_charge_percent,
    vatPercent: bill.vat_percent,
    roundingAbsorberPeerId: bill.rounding_absorber_peer_id ?? selfPeerId ?? undefined,
  };
}
```

`BillEditor.tsx`: pass `selfPeerId` into the `mapToBillInput` call (it already has `selfPeerId` as a prop).

`PeerBill.tsx`: add `roundingAbsorberPeerId: item.roundingAbsorberPeerId ?? undefined` to each mapped item, and `roundingAbsorberPeerId: bill.bill.roundingAbsorberPeerId ?? undefined` to the bill-level `billInput` object.

Run `npm run check` — fix type errors before moving on.

Commit: `feat(app): wire both rounding absorbers through mapper + peer view (#33)`

### Task 5 — picker UI (item-level + bill-level)

Recreate the finalized picker component from this session's artifact (leftover badge, auto-selected, chevron affordance, expandable inline picker with a labeled shuffle option — use the real app's icon library, not inline SVG, and its real peer-chip styling) as a shared component, e.g. `RoundingLeftoverBadge`, taking:
```ts
{
  leftoverSatang: number;         // 0 → render null, nothing at all
  candidateIds: string[];         // item's tickedBy, or all bill peers
  candidateNames: Record<string, string>;
  absorberId: string;
  onChange: (peerId: string) => void;
}
```

**Item-level:** add it to each item row in `MatrixView.tsx` and `CardsView.tsx`. These need the per-item leftover amount and current absorber, which the plan's Task 2 output doesn't directly expose yet — expose it: extend `BillResult` with `itemLeftovers: Record<string, { leftoverSatang: number; absorberPeerId: string }>` (only items with `tickedBy.length >= 2` AND a nonzero `itemRemainder` get an entry), computed alongside `itemSplits` in the same loop, so the UI never has to reverse-engineer it. `onChange` calls `updateLineItem(itemId, { rounding_absorber_peer_id: peerId })`.

**Bill-level:** add it to the "เช็คกับใบเสร็จ" section. Extend `BillResult` similarly with `billLeftover: { leftoverSatang: number; absorberPeerId: string } | undefined` (present only when the bill-tier `remainder !== 0` — **verified this is NOT the same as "SC or VAT is nonzero"**: the two-single-ticker-item example above has a nonzero bill-tier remainder with SC = VAT = 0%, purely from item-ceiling overshoot). `onChange` calls `updateBill(billId, { rounding_absorber_peer_id: peerId })`.

Both components only render when their respective leftover is present — confirmed already in the artifact's live "น้ำเปล่า" (evenly-divisible) row, which renders nothing.

Verify manually (post-implementation testing is acceptable for UI per CLAUDE.md): a bill with the cross-item example above (a ฿100 item split A/B/C, a ฿25 item split D/E/F) shows two independent item badges defaulting to A and D; changing one doesn't affect the other; the peer link (`/b/[id]`) shows the same tied totals with no picker visible.

Commit: `feat(ui): item + bill rounding-leftover pickers (#33)`

### Task 6 — close out

Update `docs/STATUS.md`: move #33 into Shipped once merged, Decision Log row citing ADR-0011.

## Definition of Done

1. `npm run check` (lint + typecheck + unit tests) passes with ZERO errors.
2. `src/lib/billing/compute.ts` and `fraction.ts` changes have test coverage: the 6 updated tests, the 6 new tests (cross-item independence, item override, item stale-fallback, bill override, non-negative-VAT regression, negative-remainder guard), and the untouched canonical Katsu CSV fixture (still exactly `A=179.10, B=187.20, C=179.10, D=143.10, E=214.20`, checksum `902.70`).
3. Peer-facing flow (`/b/[id]`) verified on a mobile viewport showing the same tied totals as the organizer's editor, with no picker UI exposed to peers.
