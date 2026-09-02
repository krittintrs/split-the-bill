# FX Rate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** [#38](https://github.com/krittintrs/split-the-bill/issues/38)
**Goal:** Let the organizer record a Bill's line items in a foreign Purchase Currency (e.g. TWD from a Taipei trip) with a manually-entered FX Rate, while peers still pay back in THB via PromptPay — with a receipt-verification checksum in the Purchase Currency AND a conversion-verification checksum in THB, both tying exactly.
**Architecture:** `computeBill()`'s existing exact-BigInt-fraction pipeline (item discounts → bill discount → service charge → VAT → per-peer ceiling → ADR-0011 rounding-absorber leftover) is extracted into one `settleAtScale()` helper parameterized by a ratio `Fraction`, then called twice: once at identity (the Purchase-Currency figures, unaffected, byte-for-byte what the engine already produces today) and once with the FX Rate folded in as one more multiplier (the THB figures — `peerTotals`, `checksumSatang`, etc. — which is what actually settles debts and drives the QR). No new rounding tier, no second absorber selector: the existing single `roundingAbsorberPeerId` control is reused for both scales.
**Spec:** `CONTEXT.md` (Purchase Currency / FX Rate / Purchase Subtotal / Purchase Checksum glossary entries), `CLAUDE.md`'s amended money rule, `docs/STATUS.md` Decision Log (2026-09-01 entries), and issue #38's body + comments (layout decisions from the mockup review).

## Global Constraints

(from `CLAUDE.md` — every task below inherits these)

- Modification Constraint: do not modify anything not asked for here. If unsure, ask.
- All bill math lives in `src/lib/billing/` as pure functions. No money arithmetic in components, API routes, or the DB.
- Money is integer minor-units everywhere, never a float. THB satang is the only currency that ever settles a debt; a Bill's optional Purchase Currency amounts are integer minor-units too, converted to THB satang exactly once via the Bill's FX Rate.
- Peers get capability-URL access only (no accounts). Nothing peer-facing may require login.
- Supabase is the single source of truth for bill state; no duplicated client-side shadow state beyond the existing `computeBill()`-on-the-client pattern already used by `PeerBill.tsx`/`BillEditor.tsx`.
- Responsive UI, mobile and desktop both first-class.
- `src/lib/billing/`: TDD mandatory (failing test → implement → verify green). The canonical Katsu CSV fixture (Person A=179.10, B=187.20, C=179.10, D=143.10, E=214.20, checksum 902.70) must keep passing unchanged, and must keep producing `purchase: undefined` (no Purchase Currency on that fixture).
- Components/UI: post-implementation testing acceptable (still verify manually per task).

## File Map

| File | Change |
|---|---|
| `src/lib/billing/fraction.ts` | Add `ONE` constant (identity ratio) |
| `src/lib/billing/types.ts` | `BillInput`: add `purchaseCurrency?`, `fxRateNumerator?`, `fxRateDenominator?`. `BillResult`: add `purchase?: PurchaseSideResult` |
| `src/lib/billing/compute.ts` | Extract `settleAtScale()`; call it twice (identity + FX ratio) |
| `src/lib/billing/compute.test.ts` | New validation + behavioral tests |
| `src/lib/billing/money.ts` | Add `formatMinorUnits(amountMinor, currencyCode)` |
| `src/lib/billing/money.test.ts` | New tests for `formatMinorUnits` |
| `supabase/migrations/20260902000000_fx_rate.sql` | New: `bills.purchase_currency` / `fx_rate_numerator` / `fx_rate_denominator` + constraints; reissue `get_bill()` |
| `src/lib/bills/types.ts` | `BillRow`: add the three new columns |
| `src/lib/bills/mutations.ts` | `BillPatch`: whitelist the three new columns |
| `src/lib/bills/mapper.ts` | `mapToBillInput`: pass the three new fields through |
| `src/lib/bills/getBill.ts` | `GetBillJson.bill`: add the three new camelCase fields |
| `src/app/bills/[id]/BillEditor.tsx` | New FX card (after header, before รายการอาหาร); relocate เช็คกับใบเสร็จ section to after ช่องทางรับเงิน; add dual Purchase/THB blocks to it |
| `src/app/bills/[id]/MatrixView.tsx` | Currency-aware price column header + per-item share formatting |
| `src/app/bills/[id]/CardsView.tsx` | Currency-aware item price + per-item share formatting |
| `src/app/b/[id]/PeerBill.tsx` | FX note bar; currency-aware item prices; own-total conversion note; two-column desktop layout (matrix left, total+QR card right) |

## Task 1: Billing engine — FX fields + validation (TDD)

**Files:**
- Modify: `src/lib/billing/fraction.ts`
- Modify: `src/lib/billing/types.ts`
- Modify: `src/lib/billing/compute.ts` (`validate()` only, ~line 204-243)
- Test: `src/lib/billing/compute.test.ts`

**Interfaces:**
- Produces: `BillInput.purchaseCurrency?: string`, `BillInput.fxRateNumerator?: number`, `BillInput.fxRateDenominator?: number` — both-or-neither, positive integers, THB per 1 unit of `purchaseCurrency`.
- Produces: `ONE: Fraction` (from `fraction.ts`) — the identity ratio `{ numerator: 1n, denominator: 1n }`.

- [ ] **Step 1: Write the failing validation tests**

Append to `src/lib/billing/compute.test.ts`, inside (or right after) the `describe("computeBill validation ...")` block:

```ts
  it("rejects purchaseCurrency without a matching FX rate", () => {
    expect(() => computeBill({ ...base, purchaseCurrency: "TWD" })).toThrow(
      "purchaseCurrency and fxRateNumerator/fxRateDenominator must be set together",
    );
  });
  it("rejects an FX rate without a purchaseCurrency", () => {
    expect(() =>
      computeBill({ ...base, fxRateNumerator: 115, fxRateDenominator: 100 }),
    ).toThrow("purchaseCurrency and fxRateNumerator/fxRateDenominator must be set together");
  });
  it("rejects an empty purchaseCurrency", () => {
    expect(() =>
      computeBill({ ...base, purchaseCurrency: "  ", fxRateNumerator: 115, fxRateDenominator: 100 }),
    ).toThrow("purchaseCurrency must not be empty");
  });
  it("rejects a non-positive or non-integer FX rate", () => {
    expect(() =>
      computeBill({ ...base, purchaseCurrency: "TWD", fxRateNumerator: 0, fxRateDenominator: 100 }),
    ).toThrow("fxRateNumerator must be a positive integer");
    expect(() =>
      computeBill({ ...base, purchaseCurrency: "TWD", fxRateNumerator: 1.5, fxRateDenominator: 100 }),
    ).toThrow("fxRateNumerator must be a positive integer");
    expect(() =>
      computeBill({ ...base, purchaseCurrency: "TWD", fxRateNumerator: 115, fxRateDenominator: 0 }),
    ).toThrow("fxRateDenominator must be a positive integer");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- compute.test.ts`
Expected: FAIL — `purchaseCurrency`/`fxRateNumerator`/`fxRateDenominator` don't exist on `BillInput` yet (TS error) and no validation throws yet.

- [ ] **Step 3: Add the fields and validation**

In `src/lib/billing/fraction.ts`, add next to `ZERO`:

```ts
export const ONE: Fraction = { numerator: 1n, denominator: 1n };
```

In `src/lib/billing/types.ts`, extend `BillInput`:

```ts
export interface BillInput {
  items: LineItemInput[];
  peerIds: string[];
  billDiscount?: BillDiscount;
  serviceChargePercent: number; // integer 0-100
  vatPercent: number; // integer 0-100
  /**
   * ADR-0011: peer who keeps the bill-wide rounding discount (everyone else's independent
   * ceiling is subtracted from their total). Falls back to peerIds[0] if unset or stale.
   */
  roundingAbsorberPeerId?: string;
  /**
   * #38: the receipt's own currency when it isn't THB (e.g. "TWD"), free text, one per Bill.
   * Must be set together with fxRateNumerator/fxRateDenominator, or neither.
   */
  purchaseCurrency?: string;
  /**
   * #38: exact rate as an integer fraction — THB per 1 unit of purchaseCurrency.
   * e.g. "1 TWD = 1.15 THB" is numerator=115, denominator=100. Never a float.
   */
  fxRateNumerator?: number;
  fxRateDenominator?: number;
}
```

In `src/lib/billing/compute.ts`, inside `validate()`, append after the existing item loop (the `// 3. Each item: ...` block), right before the function's closing `}`:

```ts

  // 4. FX (#38): purchaseCurrency and fxRate must both be present or both absent.
  const hasCurrency = input.purchaseCurrency !== undefined;
  const hasRate = input.fxRateNumerator !== undefined || input.fxRateDenominator !== undefined;
  if (hasCurrency !== hasRate)
    throw new Error("purchaseCurrency and fxRateNumerator/fxRateDenominator must be set together");
  if (hasCurrency) {
    if (input.purchaseCurrency!.trim().length === 0)
      throw new Error("purchaseCurrency must not be empty");
    assertPositiveInt(input.fxRateNumerator!, "fxRateNumerator");
    assertPositiveInt(input.fxRateDenominator!, "fxRateDenominator");
  }
```

and add the helper next to `assertSatang`/`assertPercent`:

```ts
function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- compute.test.ts`
Expected: PASS (the 4 new tests; existing tests still green)

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/fraction.ts src/lib/billing/types.ts src/lib/billing/compute.ts src/lib/billing/compute.test.ts
git commit -m "feat(billing): FX rate fields + validation (#38)"
```

## Task 2: Billing engine — dual-scale settlement (TDD)

**Files:**
- Modify: `src/lib/billing/compute.ts` (extract `settleAtScale`, call twice)
- Modify: `src/lib/billing/types.ts` (`PurchaseSideResult`, `BillResult.purchase`)
- Test: `src/lib/billing/compute.test.ts`

**Interfaces:**
- Consumes: `ONE` from `fraction.ts` (Task 1); `BillInput.purchaseCurrency`/`fxRateNumerator`/`fxRateDenominator` (Task 1).
- Produces: `BillResult.purchase: PurchaseSideResult | undefined` — present only when `purchaseCurrency` is set; mirrors the top-level fields but before the FX Rate is applied (the "does my math match the paper receipt" check). Top-level `peerTotals`/`checksumSatang`/`receiptTotalSatang`/`subtotalSatang`/`serviceChargeSatang`/`vatSatang`/`discountSatang`/`peerBreakdowns`/`billLeftover`/`surplusSatang` keep their existing meaning and shape — always THB, unaffected for any Bill with no `purchaseCurrency`.

- [ ] **Step 1: Write the failing behavioral test**

Append to `src/lib/billing/compute.test.ts` (new `describe` block):

```ts
describe("computeBill with a Purchase Currency + FX Rate (#38)", () => {
  it("produces both a Purchase-scale and a THB-scale settlement, each tying exactly", () => {
    const bill: BillInput = {
      items: [{ id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
      roundingAbsorberPeerId: "a",
      purchaseCurrency: "TWD",
      fxRateNumerator: 115,
      fxRateDenominator: 100,
    };
    const r = computeBill(bill);

    // Purchase side (TWD): NT$100.00 ÷ 3 → ceil 33.34 each → checksum 100.02 vs
    // receipt 100.00 → leftover 0.02 off the absorber (identical mechanism to ADR-0011,
    // unaffected by FX — same worked example as ADR-0011's own doc, just at ×100 scale).
    expect(r.purchase).toEqual({
      currency: "TWD",
      rateNumerator: 115,
      rateDenominator: 100,
      peerTotals: { a: 3332, b: 3334, c: 3334 },
      checksumSatang: 10000,
      receiptTotalSatang: 10000,
      surplusSatang: 0,
      discountSatang: 0,
      subtotalSatang: 10000,
      serviceChargeSatang: 0,
      vatSatang: 0,
      // Peer "a" absorbs the leftover: total drops to 3332, but its OWN independent ceiling
      // (subtotalSatang, unaffected by the subtraction — ADR-0011) stays 3334, so the displayed
      // vatSatang residual (total − subtotal − SC) goes negative. Documented ADR-0011 behavior,
      // not a bug: peerTotals itself (checked below) is never negative.
      peerBreakdowns: {
        a: { discountSatang: 0, subtotalSatang: 3334, serviceChargeSatang: 0, vatSatang: -2 },
        b: { discountSatang: 0, subtotalSatang: 3334, serviceChargeSatang: 0, vatSatang: 0 },
        c: { discountSatang: 0, subtotalSatang: 3334, serviceChargeSatang: 0, vatSatang: 0 },
      },
      billLeftover: { leftoverSatang: 2, absorberPeerId: "a" },
    });

    // THB side (top level): same three exact fractions × 1.15 → 38.34 each → checksum
    // 115.02 vs receipt (100.00 × 1.15 = 115.00) → leftover 0.02 off the same absorber.
    expect(r.peerTotals).toEqual({ a: 3832, b: 3834, c: 3834 });
    expect(r.checksumSatang).toBe(11500);
    expect(r.receiptTotalSatang).toBe(11500);
    expect(r.surplusSatang).toBe(0);
    expect(r.billLeftover).toEqual({ leftoverSatang: 2, absorberPeerId: "a" });
    // Same negative-residual note as the purchase side above, at THB scale.
    expect(r.peerBreakdowns.a).toEqual({
      discountSatang: 0,
      subtotalSatang: 3834,
      serviceChargeSatang: 0,
      vatSatang: -2,
    });
  });

  it("leaves purchase undefined and every other field unchanged with no Purchase Currency", () => {
    const withoutFx: BillInput = {
      items: [{ id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePercent: 0,
      vatPercent: 0,
      roundingAbsorberPeerId: "a",
    };
    expect(computeBill(withoutFx).purchase).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- compute.test.ts`
Expected: FAIL — `r.purchase` is `undefined` (type error on the first assertion / property doesn't exist).

- [ ] **Step 3: Extract `settleAtScale` and call it twice**

In `src/lib/billing/types.ts`, add below `PeerBreakdown` and extend `BillResult`:

```ts
/**
 * #38: mirrors the top-level BillResult money fields, but in the Bill's Purchase Currency
 * before the FX Rate is applied. Field names keep the "Satang" suffix even though the unit
 * is the Purchase Currency's own minor unit (not THB satang) — reusing PeerBreakdown/the same
 * shape avoids a second parallel type family for a structure that never actually diverges.
 */
export interface PurchaseSideResult {
  currency: string;
  rateNumerator: number;
  rateDenominator: number;
  peerTotals: Record<string, number>;
  checksumSatang: number;
  receiptTotalSatang: number;
  surplusSatang: number;
  discountSatang: number;
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  peerBreakdowns: Record<string, PeerBreakdown>;
  billLeftover: { leftoverSatang: number; absorberPeerId: string } | undefined;
}
```

and add to `BillResult`:

```ts
  /** #38: present only when the Bill has a Purchase Currency + FX Rate. */
  purchase: PurchaseSideResult | undefined;
```

In `src/lib/billing/compute.ts`, replace everything from `// 6. Bill-level pipeline` through the final `return { ... };` (the whole scale-dependent tail of `computeBill`) with:

```ts
  // 6. Settle at two scales: identity (Purchase Currency, unaffected by FX) and, when a
  //    Purchase Currency is set, the FX Rate (THB — the only scale that ever settles a debt).
  //    Same mechanism both times (ADR-0011's single absorber), just fed a different ratio.
  const hasFx = input.purchaseCurrency !== undefined;
  const fxRatio = hasFx
    ? fraction(BigInt(input.fxRateNumerator!), BigInt(input.fxRateDenominator!))
    : ONE;

  const common = {
    subtotal,
    grossBillSatang,
    billDiscountRatio,
    scRatio,
    vatRatio,
    peerIds: input.peerIds,
    peerSubtotalFractions,
    peerGrossFractions,
    untickedItemIds,
    roundingAbsorberPeerId: input.roundingAbsorberPeerId,
  };
  const purchaseSide = settleAtScale({ ...common, ratio: ONE });
  const thbSide = hasFx ? settleAtScale({ ...common, ratio: fxRatio }) : purchaseSide;

  return {
    peerTotals: thbSide.peerTotals,
    checksumSatang: thbSide.checksumSatang,
    receiptTotalSatang: thbSide.receiptTotalSatang,
    surplusSatang: thbSide.surplusSatang,
    itemSplits,
    untickedItemIds,
    discountSatang: thbSide.discountSatang,
    subtotalSatang: thbSide.subtotalSatang,
    serviceChargeSatang: thbSide.serviceChargeSatang,
    vatSatang: thbSide.vatSatang,
    peerBreakdowns: thbSide.peerBreakdowns,
    billLeftover: thbSide.billLeftover,
    purchase: hasFx
      ? {
          currency: input.purchaseCurrency!,
          rateNumerator: input.fxRateNumerator!,
          rateDenominator: input.fxRateDenominator!,
          ...purchaseSide,
        }
      : undefined,
  };
}

interface SettleArgs {
  subtotal: Fraction;
  grossBillSatang: bigint;
  billDiscountRatio: Fraction;
  scRatio: Fraction;
  vatRatio: Fraction;
  ratio: Fraction;
  peerIds: string[];
  peerSubtotalFractions: Map<string, Fraction>;
  peerGrossFractions: Map<string, Fraction>;
  untickedItemIds: string[];
  roundingAbsorberPeerId: string | undefined;
}

interface SettledScale {
  peerTotals: Record<string, number>;
  checksumSatang: number;
  receiptTotalSatang: number;
  surplusSatang: number;
  discountSatang: number;
  subtotalSatang: number;
  serviceChargeSatang: number;
  vatSatang: number;
  peerBreakdowns: Record<string, PeerBreakdown>;
  billLeftover: { leftoverSatang: number; absorberPeerId: string } | undefined;
}

/**
 * ADR-0011's mechanism (per-peer independent ceiling + one absorbed leftover), generalized
 * with a `ratio` multiplied in before every ceiling (#38). `ratio = ONE` reproduces exactly
 * what this engine computed before #38 existed — this is the whole regression guarantee.
 */
function settleAtScale(args: SettleArgs): SettledScale {
  const {
    subtotal,
    grossBillSatang,
    billDiscountRatio,
    scRatio,
    vatRatio,
    ratio,
    peerIds,
    peerSubtotalFractions,
    peerGrossFractions,
    untickedItemIds,
    roundingAbsorberPeerId,
  } = args;

  // Bill-level: whole bill through ×billDiscount → ×ratio → +SC → +VAT, ceiling once per stage.
  const grossBillExactBill = multiply(fraction(grossBillSatang), ratio);
  const subtotalExactBill = multiply(multiply(subtotal, billDiscountRatio), ratio);
  const withScExactBill = multiply(subtotalExactBill, scRatio);
  const withVatExactBill = multiply(withScExactBill, vatRatio);
  const subtotalSatang = ceilToSatang(subtotalExactBill);
  const discountSatang = ceilToSatang(grossBillExactBill) - subtotalSatang;
  const serviceChargeSatang = ceilToSatang(withScExactBill) - subtotalSatang;
  const receiptTotalSatang = ceilToSatang(withVatExactBill);
  const vatSatang = receiptTotalSatang - subtotalSatang - serviceChargeSatang;

  // Per-peer: stage each peer's exact share through ×ratio → +SC → +VAT, ceiling once per
  // stage (ADR-0001), then subtract the bill-wide leftover from one designated peer (ADR-0011).
  const peerTotals: Record<string, number> = {};
  const peerBreakdowns: Record<string, PeerBreakdown> = {};
  const ceilTotals = new Map<string, number>();
  const ceilSubtotals = new Map<string, number>();
  const ceilScs = new Map<string, number>();
  const ceilGrosses = new Map<string, number>();
  let checksumRaw = 0;

  for (const peerId of peerIds) {
    const subtotalExact = multiply(peerSubtotalFractions.get(peerId)!, ratio);
    const grossExact = multiply(peerGrossFractions.get(peerId)!, ratio);
    const withScExact = multiply(subtotalExact, scRatio);
    const withVatExact = multiply(withScExact, vatRatio);

    const peerGrossSatang = ceilToSatang(grossExact);
    const peerSubtotalSatang = ceilToSatang(subtotalExact);
    const peerScSatang = ceilToSatang(withScExact) - peerSubtotalSatang;
    const total = ceilToSatang(withVatExact);

    ceilTotals.set(peerId, total);
    ceilSubtotals.set(peerId, peerSubtotalSatang);
    ceilScs.set(peerId, peerScSatang);
    ceilGrosses.set(peerId, peerGrossSatang);
    checksumRaw += total;
  }

  const allTicked = untickedItemIds.length === 0;
  let leftover = 0;
  let absorberId: string | undefined;

  if (allTicked) {
    leftover = checksumRaw - receiptTotalSatang; // always >= 0 — ceiling is superadditive
    let candidate =
      roundingAbsorberPeerId !== undefined && peerIds.includes(roundingAbsorberPeerId)
        ? roundingAbsorberPeerId
        : peerIds[0];

    if (leftover > (ceilTotals.get(candidate) ?? 0)) {
      let largestId = candidate;
      let largestTotal = -Infinity;
      for (const [peerId, total] of ceilTotals) {
        if (total > largestTotal) {
          largestTotal = total;
          largestId = peerId;
        }
      }
      candidate = largestId;
    }
    absorberId = candidate;
  }

  let checksumSatang = 0;
  for (const [peerId, ceilTotal] of ceilTotals) {
    const total = ceilTotal - (peerId === absorberId ? leftover : 0);
    const peerSubtotalSatang = ceilSubtotals.get(peerId)!;
    const peerScSatang = ceilScs.get(peerId)!;
    const peerVatSatang = total - peerSubtotalSatang - peerScSatang;

    peerTotals[peerId] = total;
    peerBreakdowns[peerId] = {
      discountSatang: ceilGrosses.get(peerId)! - peerSubtotalSatang,
      subtotalSatang: peerSubtotalSatang,
      serviceChargeSatang: peerScSatang,
      vatSatang: peerVatSatang,
    };
    checksumSatang += total;
  }

  const billLeftover =
    allTicked && leftover !== 0 ? { leftoverSatang: leftover, absorberPeerId: absorberId! } : undefined;

  return {
    peerTotals,
    checksumSatang,
    receiptTotalSatang,
    surplusSatang: checksumSatang - receiptTotalSatang,
    discountSatang,
    subtotalSatang,
    serviceChargeSatang,
    vatSatang,
    peerBreakdowns,
    billLeftover,
  };
}
```

Update the top import line to pull in `ONE`:

```ts
import { add, ceilToSatang, fraction, multiply, ONE, ZERO, type Fraction } from "./fraction";
```

- [ ] **Step 4: Run the full billing suite**

Run: `npm test -- src/lib/billing`
Expected: PASS — every existing test (including the canonical Katsu fixture) plus the two new ones.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/compute.ts src/lib/billing/types.ts src/lib/billing/compute.test.ts
git commit -m "feat(billing): dual purchase/THB settlement via one ratio-aware pipeline (#38)"
```

## Task 3: `formatMinorUnits` for Purchase Currency display (TDD)

**Files:**
- Modify: `src/lib/billing/money.ts`
- Test: `src/lib/billing/money.test.ts`

**Interfaces:**
- Produces: `formatMinorUnits(amountMinor: number, currencyCode: string): string` — e.g. `formatMinorUnits(22000, "TWD")` → `"TWD 220.00"`. No symbol lookup table (per the grilled "no ISO 4217 metadata" decision) — renders the stored currency code verbatim, unlike `formatSatang`'s hardcoded `฿`.

- [ ] **Step 1: Write the failing test**

In `src/lib/billing/money.test.ts`, change the import line to:

```ts
import { formatMinorUnits, formatSatang } from "./money";
```

Then append:

```ts
describe("formatMinorUnits", () => {
  it("formats with the given currency code and 2 decimal places", () => {
    expect(formatMinorUnits(22000, "TWD")).toBe("TWD 220.00");
    expect(formatMinorUnits(5, "TWD")).toBe("TWD 0.05");
    expect(formatMinorUnits(0, "USD")).toBe("USD 0.00");
  });
  it("throws on a non-integer amount", () => {
    expect(() => formatMinorUnits(100.5, "TWD")).toThrow("integer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- money.test.ts`
Expected: FAIL — `formatMinorUnits` is not exported yet.

- [ ] **Step 3: Implement**

Add to `src/lib/billing/money.ts`:

```ts
export function formatMinorUnits(amountMinor: number, currencyCode: string): string {
  if (!Number.isInteger(amountMinor)) throw new Error("amountMinor must be an integer");
  const major = amountMinor / 100;
  return `${currencyCode} ${major.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- money.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/money.ts src/lib/billing/money.test.ts
git commit -m "feat(billing): formatMinorUnits for Purchase Currency display (#38)"
```

## Task 4: Database — migration, RPC, and row/patch/json types

**Files:**
- Create: `supabase/migrations/20260902000000_fx_rate.sql`
- Modify: `src/lib/bills/types.ts`
- Modify: `src/lib/bills/mutations.ts`
- Modify: `src/lib/bills/getBill.ts`

**Interfaces:**
- Produces: `bills.purchase_currency text`, `bills.fx_rate_numerator integer`, `bills.fx_rate_denominator integer` (all nullable, both-or-neither + positive enforced by DB constraints as a second line of defense behind `compute.ts`'s own validation).
- Produces: `get_bill()` returns `purchaseCurrency`, `fxRateNumerator`, `fxRateDenominator` on `bill`.

- [ ] **Step 1: Write the migration**

```sql
-- #38: optional per-bill Purchase Currency + FX Rate (manual, exact fraction, never fetched
-- live). Both null = a pure-THB bill, unchanged from before this migration.
alter table bills
  add column purchase_currency text,
  add column fx_rate_numerator integer,
  add column fx_rate_denominator integer,
  add constraint bills_fx_rate_together check (
    (purchase_currency is null and fx_rate_numerator is null and fx_rate_denominator is null)
    or (purchase_currency is not null and fx_rate_numerator is not null and fx_rate_denominator is not null)
  ),
  add constraint bills_fx_rate_positive check (
    fx_rate_numerator is null or (fx_rate_numerator > 0 and fx_rate_denominator > 0)
  );

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
      'roundingAbsorberPeerId', b.rounding_absorber_peer_id,
      'purchaseCurrency', b.purchase_currency,
      'fxRateNumerator', b.fx_rate_numerator,
      'fxRateDenominator', b.fx_rate_denominator
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

- [ ] **Step 2: Apply the migration to the linked project**

Run (per [supabase-cli-use-global memory](../../CONTEXT.md): always the global CLI, never `npx supabase`):

```bash
supabase db push
```

Expected: `Applying migration 20260902000000_fx_rate.sql...` then success, no errors.

- [ ] **Step 3: Verify the columns and RPC**

```bash
supabase db diff --schema public
```

Expected: no diff (migration matches the linked project's actual schema).

- [ ] **Step 4: Update `BillRow`**

In `src/lib/bills/types.ts`, add to `BillRow` (next to `rounding_absorber_peer_id`):

```ts
  /** #38: both-or-neither with fx_rate_numerator/fx_rate_denominator; null = pure THB. */
  purchase_currency: string | null;
  fx_rate_numerator: number | null;
  fx_rate_denominator: number | null;
```

- [ ] **Step 5: Whitelist the new columns for writes**

In `src/lib/bills/mutations.ts`, add to the `BillPatch` `Pick<BillRow, ...>` list:

```ts
    | "purchase_currency"
    | "fx_rate_numerator"
    | "fx_rate_denominator"
```

- [ ] **Step 6: Add the fields to the anon RPC's JSON shape**

In `src/lib/bills/getBill.ts`, add to `GetBillJson["bill"]` (next to `roundingAbsorberPeerId`):

```ts
    /** #38. Both-or-neither; absent/null = pure THB. */
    purchaseCurrency?: string | null;
    fxRateNumerator?: number | null;
    fxRateDenominator?: number | null;
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260902000000_fx_rate.sql src/lib/bills/types.ts src/lib/bills/mutations.ts src/lib/bills/getBill.ts
git commit -m "feat(db): purchase currency + FX rate columns, reissue get_bill (#38)"
```

## Task 5: Bill editor — FX card, mapper wiring, currency-aware matrix, checksum relocation

**Files:**
- Modify: `src/lib/bills/mapper.ts`
- Modify: `src/app/bills/[id]/BillEditor.tsx`
- Modify: `src/app/bills/[id]/MatrixView.tsx`
- Modify: `src/app/bills/[id]/CardsView.tsx`

**Interfaces:**
- Consumes: `BillRow.purchase_currency`/`fx_rate_numerator`/`fx_rate_denominator` (Task 4), `BillResult.purchase` (Task 2), `formatMinorUnits` (Task 3).

- [ ] **Step 1: Wire the fields through `mapToBillInput`**

In `src/lib/bills/mapper.ts`, add to the returned object (next to `roundingAbsorberPeerId` — check the exact existing line via `grep -n "roundingAbsorberPeerId" src/lib/bills/mapper.ts` first, since the tail of this function wasn't reproduced above; add immediately after it):

```ts
    purchaseCurrency: bill.purchase_currency ?? undefined,
    fxRateNumerator: bill.fx_rate_numerator ?? undefined,
    fxRateDenominator: bill.fx_rate_denominator ?? undefined,
```

- [ ] **Step 2: Add the FX card to `BillEditor.tsx`**

Insert this new `<section>` between the header section (ends `</section>` right before `รายการอาหาร`) and the `รายการอาหาร` section:

```tsx
      <section className="flex flex-col gap-3 rounded-xl border-2 border-primary bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">บิลนี้จ่ายเป็นเงินต่างประเทศ</h2>
            <p className="text-xs text-ink-muted">
              ใส่ราคาจากใบเสร็จตามสกุลเงินจริง แล้วแปลงเป็นบาทให้เพื่อนจ่ายกลับ
            </p>
          </div>
          <input
            type="checkbox"
            checked={bill.purchase_currency !== null}
            onChange={(e) =>
              saveBill(
                e.target.checked
                  ? { purchase_currency: "", fx_rate_numerator: 1, fx_rate_denominator: 1 }
                  : { purchase_currency: null, fx_rate_numerator: null, fx_rate_denominator: null },
              )
            }
            className="h-6 w-11 accent-primary"
            aria-label="เปิดใช้งานสกุลเงินต่างประเทศ"
          />
        </div>
        {bill.purchase_currency !== null && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              สกุลเงินต้นทาง
              <input
                key={`currency-${bill.purchase_currency}`}
                defaultValue={bill.purchase_currency ?? ""}
                placeholder="เช่น TWD"
                onBlur={(e) => {
                  const value = e.target.value.trim().toUpperCase();
                  if (value !== bill.purchase_currency) saveBill({ purchase_currency: value });
                }}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              อัตราแลกเปลี่ยน (1 {bill.purchase_currency || "หน่วย"} = ? ฿)
              <input
                key={`rate-${bill.fx_rate_numerator}-${bill.fx_rate_denominator}`}
                inputMode="decimal"
                defaultValue={fxRateToInput(bill.fx_rate_numerator, bill.fx_rate_denominator)}
                placeholder="1.15"
                onBlur={(e) => rateBlur(e, (n, d) => saveBill({ fx_rate_numerator: n, fx_rate_denominator: d }))}
                className={`${inputCls} tabular-nums`}
              />
              <span className="text-[11px] text-ink-muted">กรอกเอง ไม่ดึงอัตราสดจากอินเทอร์เน็ต</span>
            </label>
          </div>
        )}
      </section>
```

Add these two helpers near the file's other input helpers (`satangToInput`/`moneyBlur` — put them right alongside):

```tsx
function fxRateToInput(numerator: number | null, denominator: number | null): string {
  if (numerator === null || denominator === null || denominator === 0) return "";
  return String(numerator / denominator);
}

function rateBlur(
  e: React.FocusEvent<HTMLInputElement>,
  cb: (numerator: number, denominator: number) => void,
): void {
  const raw = e.target.value.trim();
  if (raw === "") return;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return;
  const [, whole, frac = ""] = match;
  const numerator = Number(whole + frac);
  const denominator = 10 ** frac.length;
  if (numerator <= 0) return;
  cb(numerator, denominator);
}
```

- [ ] **Step 3: Relocate เช็คกับใบเสร็จ to the bottom, and add the THB block**

Move the existing `เช็คกับใบเสร็จ` `<section>` (currently right after `ส่วนลด · Service charge · VAT`, before `PeerPicker`/`MatrixView`/`CardsView`) to after the `ช่องทางรับเงิน` section (the last section in the file today). Inside it, after the existing subtotal/SC/VAT/รวม block, add the THB block — shown only when a Purchase Currency is set:

```tsx
        {bill.purchase_currency !== null && result.purchase && (
          <div className="mt-4 rounded-lg border border-dashed border-primary bg-surface-tint p-3">
            <p className="mb-2 text-xs font-semibold text-primary-ink">
              ยอดที่จะได้รับจริง (฿) &middot; แปลงด้วยอัตรา 1 {result.purchase.currency} = ฿
              {(result.purchase.rateNumerator / result.purchase.rateDenominator).toString()}
            </p>
            <div className="flex justify-between gap-4 font-bold tabular-nums text-ink">
              <span>เช็คกับใบเสร็จ &times; อัตรา (฿)</span>
              <span>{formatSatang(result.checksumSatang)}</span>
            </div>
          </div>
        )}
```

and rename the existing `฿` labels in that section to say `({result.purchase.currency})` when Purchase Currency is set, e.g. `ยอดตามใบเสร็จ ฿` becomes:

```tsx
              ยอดตามใบเสร็จ ({bill.purchase_currency ?? "฿"})
```

- [ ] **Step 4: Currency-aware matrix price column**

In `src/app/bills/[id]/MatrixView.tsx`, add `purchaseCurrency: string | null` to `Props` and thread it through from `BillEditor.tsx`'s `<MatrixView purchaseCurrency={bill.purchase_currency} ... />`. Replace the hardcoded `฿` header:

```tsx
              <th className="p-2 text-right font-semibold">{purchaseCurrency ?? "฿"}</th>
```

and the per-item share line, importing `formatMinorUnits`:

```tsx
                    {!unticked && share !== undefined && (
                      <p className="mt-1 text-xs tabular-nums text-ink-muted">
                        ÷ {tickerCount} ={" "}
                        {purchaseCurrency ? formatMinorUnits(share, purchaseCurrency) : formatSatang(share)}{" "}
                        ต่อคน
                      </p>
                    )}
```

- [ ] **Step 5: Same swap in `CardsView.tsx`**

Add the same `purchaseCurrency: string | null` prop (threaded from `BillEditor.tsx`'s `<CardsView purchaseCurrency={bill.purchase_currency} ... />`), and swap the two currency-bearing lines identified earlier:

```tsx
                  {purchaseCurrency
                    ? formatMinorUnits(item.unit_price_satang * item.qty, purchaseCurrency)
                    : formatSatang(item.unit_price_satang * item.qty)}
```

```tsx
                    ÷ {tickerCount} ={" "}
                    {purchaseCurrency ? formatMinorUnits(share, purchaseCurrency) : formatSatang(share)}{" "}
                    ต่อคน
```

`result.peerTotals`/`result.checksumSatang`/`result.surplusSatang` in both files stay on `formatSatang` unchanged — those are always THB by construction (Task 2).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Manual smoke test**

Open a bill in the editor, toggle "บิลนี้จ่ายเป็นเงินต่างประเทศ" on, type `TWD` and `1.15`, add an item priced `220.00`, tick 3 peers. Verify: the matrix's price column header shows `TWD`, the per-item share line shows `TWD 73.34`, เช็คกับใบเสร็จ is now the last section on the page (after ช่องทางรับเงิน) and shows both the TWD receipt check and the ฿ conversion block, and the existing rounding-leftover picker (in the matrix/cards footer) still works and now reflects THB amounts.

- [ ] **Step 8: Commit**

```bash
git add src/lib/bills/mapper.ts src/app/bills/[id]/BillEditor.tsx src/app/bills/[id]/MatrixView.tsx src/app/bills/[id]/CardsView.tsx
git commit -m "feat(ui): FX card, currency-aware matrix, checksum moved to bottom (#38)"
```

## Task 6: Peer view — FX note, currency-aware items, two-column desktop

**Files:**
- Modify: `src/app/b/[id]/PeerBill.tsx`

**Interfaces:**
- Consumes: `GetBillJson.bill.purchaseCurrency`/`fxRateNumerator`/`fxRateDenominator` (Task 4), `BillResult.purchase` (Task 2), `formatMinorUnits` (Task 3).

- [ ] **Step 1: Wire the fields into the local `BillInput`**

In the `billInput` `useMemo` (around line 183-196), add:

```tsx
      purchaseCurrency: bill.bill.purchaseCurrency ?? undefined,
      fxRateNumerator: bill.bill.fxRateNumerator ?? undefined,
      fxRateDenominator: bill.bill.fxRateDenominator ?? undefined,
```

and add `bill.bill.purchaseCurrency`, `bill.bill.fxRateNumerator`, `bill.bill.fxRateDenominator` are already covered by the existing `bill.bill` dependency in that `useMemo`'s deps array — no change needed there.

- [ ] **Step 2: FX note bar**

Right after the `<header>` block (before `{locked && (...)}`), add:

```tsx
      {bill.bill.purchaseCurrency && (
        <p className="rounded-xl bg-surface-tint p-3 text-sm font-medium text-primary-ink">
          บิลนี้จ่ายเป็น {bill.bill.purchaseCurrency} &middot; แปลงเป็นบาทด้วยอัตรา 1{" "}
          {bill.bill.purchaseCurrency} = ฿
          {((bill.bill.fxRateNumerator ?? 1) / (bill.bill.fxRateDenominator ?? 1)).toString()}
        </p>
      )}
```

- [ ] **Step 3: Currency-aware item prices**

Find every `formatSatang(item...)`/`formatSatang(itemTotalSatang(...))`/`formatSatang(itemShareSatang(...))` call inside the item list (both `matrixView` and `chipListView`, and the peer's own claimed-row breakdown) and swap to:

```tsx
{bill.bill.purchaseCurrency ? formatMinorUnits(amount, bill.bill.purchaseCurrency) : formatSatang(amount)}
```

(`amount` is whatever expression was already inside that particular `formatSatang(...)` call — do not touch `result.peerTotals[...]`, `result.checksumSatang`, or PromptPay/paid-amount displays, which stay `formatSatang` unconditionally since they are always THB.)

- [ ] **Step 4: Own-total conversion note**

In the peer's own claimed-row / total display, right below their `formatSatang(result.peerTotals[peerId])` figure, add — only when `result.purchase` exists:

```tsx
{result.purchase && (
  <p className="text-xs text-ink-muted">
    แปลงจาก {formatMinorUnits(result.purchase.peerTotals[selfPeerId] ?? 0, result.purchase.currency)} &middot;
    อัตรา 1 {result.purchase.currency} = ฿{(result.purchase.rateNumerator / result.purchase.rateDenominator).toString()}
  </p>
)}
```

(adjust the exact peer-id variable name to match whatever the surrounding code already uses for "the signed-in/claimed peer" — grep `selfPeerId` in this file first to confirm.)

- [ ] **Step 5: Two-column desktop layout**

Change the page's root `<main>` from single-column to a responsive grid at `lg:`, matrix + payback panel side by side:

```tsx
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-10">
      <header className="flex items-start justify-between gap-3">
        {/* unchanged */}
      </header>

      {/* unchanged: locked banner, FX note bar */}

      <div className="lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <div className="hidden lg:block">{matrixView}</div>
          <div className="lg:hidden">{chipListView}</div>
        </div>
        <div className="mt-4 lg:mt-0">{paybackPanel}</div>
      </div>
    </main>
```

(today's order is `{paybackPanel}` then `matrixView`/`chipListView` full-width; this reorders `paybackPanel` to the right column, matrix/cards to the left, `lg:` only — mobile keeps today's stacked order via the `chipListView` branch rendering first in source but visually below in the flex-col-only-below-`lg:` layout. Verify visually per Step 7 that mobile's DOM order still reads locked-banner → FX note → payback panel → chip list, unchanged from today, since the grid only activates at `lg:`.)

- [ ] **Step 6: Typecheck and lint**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Manual smoke test (mobile + desktop viewports)**

Open a peer link for a Bill with Purchase Currency set. Verify: FX note bar shows the rate; item rows show Purchase Currency amounts; own total shows the THB figure plus the "แปลงจาก ..." conversion line; PromptPay QR still encodes the THB amount unchanged; on a narrow viewport the page is still single-column in the original order; on a wide viewport the matrix sits left and the total/QR card sits right.

- [ ] **Step 8: Commit**

```bash
git add src/app/b/[id]/PeerBill.tsx
git commit -m "feat(ui): peer FX note, currency-aware items, two-column desktop (#38)"
```

## Task 7: Full regression + final verification

- [ ] **Step 1: Run the full DoD command**

Run: `npm run check`
Expected: 0 errors — lint, typecheck, and every unit test (including the canonical Katsu fixture and the two new FX tests) green.

- [ ] **Step 2: Manual smoke test on a mobile viewport**

Per `CLAUDE.md`'s DoD: verify the full flow (create bill → toggle FX → enter items → tick peers → check both checksums → open peer link → pay) on a real mobile viewport, not just desktop.

- [ ] **Step 3: Update `docs/STATUS.md`**

Add a "#38 shipped as vX.Y.0" line to the roadmap and Decision Log, following the existing format for shipped issues (see the #33/#20 entries for the pattern). Delete this plan file once the PR merges, per `CLAUDE.md`'s Project File Lifecycle (`docs/plans/PLAN-*.md` is disposable).

- [ ] **Step 4: Commit**

```bash
git add docs/STATUS.md
git commit -m "docs: FX rate shipped (#38)"
```

## Definition of Done

```
npm run check
```

Zero errors. All tests green, including:
- The canonical Katsu CSV fixture (Person A=179.10, B=187.20, C=179.10, D=143.10, E=214.20, checksum 902.70) — unaffected, `purchase` field `undefined`.
- The new FX validation tests (Task 1) and the dual-scale settlement test (Task 2).
- Peer-facing flows (FX note, currency-aware items, THB total, QR, two-column desktop) verified on a mobile viewport per Task 6 Step 7 and Task 7 Step 2.
