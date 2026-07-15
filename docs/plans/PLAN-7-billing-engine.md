# Billing Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or the project dev subagent) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Issue:** #7
**Goal:** `computeBill(input) → per-peer totals, checksum, item splits` — the single pure module all money math lives in, verifiable entirely by its test suite.
**Architecture:** Exact integer-fraction arithmetic (BigInt numerator/denominator) through the fixed charge pipeline (ADR-0003), with exactly one round-up per Peer Total at the end (ADR-0001). Results are derived, never persisted (ADR-0004). No UI, no Supabase, no floats.

## Global Constraints (from CLAUDE.md)

- All bill math lives in `src/lib/billing/` as pure functions. No money arithmetic anywhere else.
- Money is integer satang everywhere; ฿ only at the display edge; never float arithmetic on money.
- TDD mandatory for this layer: failing test → implement → verify green, every task.
- Do NOT modify things not asked for.
- Conventional Commits, subject under 50 chars.
- DoD: `npm run check` (lint + typecheck + vitest) with zero errors.

## Grilled decisions baked into this plan (2026-07-15)

1. **Input contract:** item + bill discounts each allow `pct` and `amountSatang` together, % applied first; `qty` multiplies line total before even split; engine sees ids only, never names.
2. **Output contract:** `peerTotals` = single ceil of exact pipeline sum (the money truth); `itemSplits` = display-only per-cell ceils that may sum slightly above a peer total; `receiptTotalSatang` computed (not organizer input); `surplusSatang = checksum − receiptTotal` (negative when items are unticked — signals shortfall).
3. **Math:** exact BigInt fractions, one `ceil` division per rounded value, zero floats.
4. **Validation:** malformed input (non-integer satang, negatives, pct outside integer 0–100, unknown/duplicate peer, duplicate item id) **throws**; incomplete-while-editing states (no tickers, over-discount, empty bill) compute **gracefully** with ฿0 clamps + flags. Percents are integers — every real bill used 0/5/7/10; loosen only if a real receipt demands it.

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/billing/frac.ts` | Create | Exact rational arithmetic on BigInt (`Frac`, `mul`, `add`, `ceilToSatang`) — internal to the engine |
| `src/lib/billing/frac.test.ts` | Create | Unit tests for fraction math |
| `src/lib/billing/types.ts` | Create | `BillInput`, `LineItemInput`, `BillDiscount`, `BillResult` — the contract every later ticket imports |
| `src/lib/billing/compute.ts` | Create | `computeBill` + input validation |
| `src/lib/billing/compute.test.ts` | Create | Pipeline tests incl. canonical Katsu fixture |

Untouched: `money.ts`, everything outside `src/lib/billing/`, all app/auth code.

---

### Task 0: Branch

- [ ] **Step 1: Create feature branch from up-to-date main**

```bash
git checkout main && git pull && git checkout -b feat/7-billing-engine
```

- [ ] **Step 2: Commit ADR + this plan** (if not already committed)

```bash
git add docs/adr/0004-bill-results-derived-not-persisted.md docs/plans/PLAN-7-billing-engine.md
git commit -m "docs: adr-0004 and plan for #7"
```

---

### Task 1: Fraction math (`frac.ts`)

**Files:**
- Create: `src/lib/billing/frac.ts`
- Test: `src/lib/billing/frac.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Frac { num: bigint; den: bigint }`, `frac(num, den?)`, `mul(a, b)`, `add(a, b)`, `ZERO`, `ceilToSatang(a): number` — Task 3+ builds the pipeline on these exact names.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/billing/frac.test.ts
import { describe, expect, it } from "vitest";
import { add, ceilToSatang, frac, mul, ZERO } from "./frac";

describe("frac", () => {
  it("defaults denominator to 1", () => {
    expect(frac(5n)).toEqual({ num: 5n, den: 1n });
  });
  it("rejects non-positive denominator", () => {
    expect(() => frac(1n, 0n)).toThrow("denominator must be positive");
  });
});

describe("mul", () => {
  it("multiplies exactly", () => {
    // 3/2 × 4/5 = 12/10 (no reduction needed, BigInt never overflows)
    expect(mul(frac(3n, 2n), frac(4n, 5n))).toEqual({ num: 12n, den: 10n });
  });
});

describe("add", () => {
  it("adds via cross multiplication", () => {
    // 1/2 + 1/3 = 5/6
    expect(add(frac(1n, 2n), frac(1n, 3n))).toEqual({ num: 5n, den: 6n });
  });
  it("adding ZERO keeps value", () => {
    expect(add(ZERO, frac(7n, 3n))).toEqual({ num: 7n, den: 3n });
  });
});

describe("ceilToSatang", () => {
  it("rounds up a fractional amount", () => {
    expect(ceilToSatang(frac(2500n, 3n))).toBe(834); // ADR-0001 example
  });
  it("keeps an exact amount unchanged", () => {
    expect(ceilToSatang(frac(17910n, 1n))).toBe(17910);
  });
  it("rounds up fractions with large denominators exactly", () => {
    // 29425000/30000 = 980.8333… → 981 (no float drift)
    expect(ceilToSatang(frac(29425000n, 30000n))).toBe(981);
  });
  it("rejects negative amounts", () => {
    expect(() => ceilToSatang(frac(-1n, 2n))).toThrow("cannot round a negative amount");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/billing/frac.test.ts`
Expected: FAIL — cannot resolve `./frac`

- [ ] **Step 3: Implement**

```ts
// src/lib/billing/frac.ts
/** Exact rational arithmetic on BigInt. Internal to the billing engine. */
export interface Frac {
  num: bigint;
  den: bigint; // always > 0
}

export function frac(num: bigint, den: bigint = 1n): Frac {
  if (den <= 0n) throw new Error("denominator must be positive");
  return { num, den };
}

export const ZERO: Frac = { num: 0n, den: 1n };

export function mul(a: Frac, b: Frac): Frac {
  return { num: a.num * b.num, den: a.den * b.den };
}

export function add(a: Frac, b: Frac): Frac {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}

/** The engine's only rounding operation (ADR-0001): round UP to integer satang. */
export function ceilToSatang(a: Frac): number {
  if (a.num < 0n) throw new Error("cannot round a negative amount");
  return Number((a.num + a.den - 1n) / a.den);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/billing/frac.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/frac.ts src/lib/billing/frac.test.ts
git commit -m "feat: exact fraction math for billing"
```

---

### Task 2: Contract types + validation

**Files:**
- Create: `src/lib/billing/types.ts`
- Create: `src/lib/billing/compute.ts` (validation + graceful-zero skeleton)
- Test: `src/lib/billing/compute.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `BillInput`, `LineItemInput`, `BillDiscount`, `BillResult`, `computeBill(input: BillInput): BillResult` — tickets #8/#9 import these exact names.

- [ ] **Step 1: Write the types** (contract approved in grilling, copy verbatim)

```ts
// src/lib/billing/types.ts
export interface LineItemInput {
  id: string;
  unitPriceSatang: number;
  qty: number; // line total = unitPrice × qty
  discountPct?: number; // integer 0-100, applied first (ADR-0003)
  discountAmountSatang?: number; // then subtracted
  tickedBy: string[]; // peer ids; [] = unticked
}

export interface BillDiscount {
  pct?: number; // integer 0-100, applied first
  amountSatang?: number; // applied after pct
}

export interface BillInput {
  items: LineItemInput[];
  peerIds: string[];
  billDiscount?: BillDiscount;
  serviceChargePct: number; // integer 0-100
  vatPct: number; // integer 0-100
}

export interface BillResult {
  /** The money truth: exact pipeline sum, ceil'd ONCE per peer (ADR-0001). */
  peerTotals: Record<string, number>;
  /** Sum of peerTotals — the sheet's Check sum. */
  checksumSatang: number;
  /** Exact bill total after the full pipeline, ceil'd once; compare vs paper receipt. */
  receiptTotalSatang: number;
  /** checksum − receiptTotal; negative when items are unticked (shortfall). */
  surplusSatang: number;
  /** DISPLAY ONLY: per-item per-peer share, each ceil'd; may sum slightly above peerTotal. */
  itemSplits: Record<string, Record<string, number>>;
  /** Items with tickedBy = [] — contribute ฿0; organizer must chase these. */
  untickedItemIds: string[];
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/billing/compute.test.ts
import { describe, expect, it } from "vitest";
import { computeBill } from "./compute";
import type { BillInput } from "./types";

const base: BillInput = {
  items: [],
  peerIds: ["a", "b"],
  serviceChargePct: 0,
  vatPct: 0,
};

const item = (over: Partial<BillInput["items"][number]> = {}) => ({
  id: "i1",
  unitPriceSatang: 10000,
  qty: 1,
  tickedBy: ["a"],
  ...over,
});

describe("computeBill validation (malformed input throws)", () => {
  it("rejects non-integer satang price", () => {
    expect(() => computeBill({ ...base, items: [item({ unitPriceSatang: 100.5 })] })).toThrow(
      "non-negative integer satang",
    );
  });
  it("rejects negative price", () => {
    expect(() => computeBill({ ...base, items: [item({ unitPriceSatang: -1 })] })).toThrow(
      "non-negative integer satang",
    );
  });
  it("rejects qty below 1 and non-integer qty", () => {
    expect(() => computeBill({ ...base, items: [item({ qty: 0 })] })).toThrow("positive integer");
    expect(() => computeBill({ ...base, items: [item({ qty: 1.5 })] })).toThrow("positive integer");
  });
  it("rejects percent outside integer 0-100", () => {
    expect(() => computeBill({ ...base, items: [item({ discountPct: 150 })] })).toThrow("0-100");
    expect(() => computeBill({ ...base, items: [item({ discountPct: 7.5 })] })).toThrow("0-100");
    expect(() => computeBill({ ...base, vatPct: -7 })).toThrow("0-100");
    expect(() => computeBill({ ...base, serviceChargePct: 101 })).toThrow("0-100");
    expect(() => computeBill({ ...base, billDiscount: { pct: 200 } })).toThrow("0-100");
  });
  it("rejects ticks by unknown peer", () => {
    expect(() => computeBill({ ...base, items: [item({ tickedBy: ["ghost"] })] })).toThrow(
      "unknown peer",
    );
  });
  it("rejects duplicate ticks by the same peer", () => {
    expect(() => computeBill({ ...base, items: [item({ tickedBy: ["a", "a"] })] })).toThrow(
      "ticked twice",
    );
  });
  it("rejects duplicate item ids", () => {
    expect(() => computeBill({ ...base, items: [item(), item()] })).toThrow("duplicate item id");
  });
  it("rejects duplicate peer ids", () => {
    expect(() => computeBill({ ...base, peerIds: ["a", "a"] })).toThrow("duplicate peerIds");
  });
});

describe("computeBill graceful incomplete states", () => {
  it("computes an empty bill as all zeros", () => {
    expect(computeBill(base)).toEqual({
      peerTotals: { a: 0, b: 0 },
      checksumSatang: 0,
      receiptTotalSatang: 0,
      surplusSatang: 0,
      itemSplits: {},
      untickedItemIds: [],
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: FAIL — cannot resolve `./compute`

- [ ] **Step 4: Implement validation + graceful-zero skeleton**

```ts
// src/lib/billing/compute.ts
import type { BillInput, BillResult } from "./types";

export function computeBill(input: BillInput): BillResult {
  validate(input);
  const peerTotals: Record<string, number> = {};
  for (const id of input.peerIds) peerTotals[id] = 0;
  return {
    peerTotals,
    checksumSatang: 0,
    receiptTotalSatang: 0,
    surplusSatang: 0,
    itemSplits: {},
    untickedItemIds: [],
  };
}

function validate(input: BillInput): void {
  const peerSet = new Set(input.peerIds);
  if (peerSet.size !== input.peerIds.length) throw new Error("duplicate peerIds");
  assertPct(input.serviceChargePct, "serviceChargePct");
  assertPct(input.vatPct, "vatPct");
  if (input.billDiscount?.pct !== undefined) assertPct(input.billDiscount.pct, "billDiscount.pct");
  if (input.billDiscount?.amountSatang !== undefined)
    assertSatang(input.billDiscount.amountSatang, "billDiscount.amountSatang");
  const seenIds = new Set<string>();
  for (const item of input.items) {
    if (seenIds.has(item.id)) throw new Error(`duplicate item id: ${item.id}`);
    seenIds.add(item.id);
    assertSatang(item.unitPriceSatang, `item ${item.id} unitPriceSatang`);
    if (!Number.isInteger(item.qty) || item.qty < 1)
      throw new Error(`item ${item.id} qty must be a positive integer`);
    if (item.discountPct !== undefined) assertPct(item.discountPct, `item ${item.id} discountPct`);
    if (item.discountAmountSatang !== undefined)
      assertSatang(item.discountAmountSatang, `item ${item.id} discountAmountSatang`);
    const seenPeers = new Set<string>();
    for (const peerId of item.tickedBy) {
      if (!peerSet.has(peerId)) throw new Error(`item ${item.id} ticked by unknown peer: ${peerId}`);
      if (seenPeers.has(peerId)) throw new Error(`item ${item.id} ticked twice by: ${peerId}`);
      seenPeers.add(peerId);
    }
  }
}

function assertSatang(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`${label} must be a non-negative integer satang`);
}

function assertPct(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    throw new Error(`${label} must be an integer 0-100`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/types.ts src/lib/billing/compute.ts src/lib/billing/compute.test.ts
git commit -m "feat: computeBill types and validation"
```

---

### Task 3: Even split pipeline (no discounts, no charges yet)

**Files:**
- Modify: `src/lib/billing/compute.ts` (replace the skeleton body)
- Test: `src/lib/billing/compute.test.ts` (append)

**Interfaces:**
- Consumes: `Frac` helpers from Task 1, types from Task 2
- Produces: the full result assembly (peerTotals/checksum/receipt/surplus/itemSplits/unticked) that Tasks 4–6 only refine

- [ ] **Step 1: Append the failing tests**

```ts
describe("even split (no discounts, no charges)", () => {
  it("splits a line evenly among tickers", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 30000, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 10000, b: 10000, c: 10000 });
    expect(r.checksumSatang).toBe(30000);
    expect(r.receiptTotalSatang).toBe(30000);
    expect(r.surplusSatang).toBe(0);
    expect(r.itemSplits).toEqual({ i1: { a: 10000, b: 10000, c: 10000 } });
  });

  it("rounds each peer UP: 2500 ÷ 3 → 834 each, surplus kept by organizer", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 834, b: 834, c: 834 });
    expect(r.checksumSatang).toBe(2502);
    expect(r.receiptTotalSatang).toBe(2500);
    expect(r.surplusSatang).toBe(2);
  });

  it("multiplies qty into the line total before splitting", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 5000, qty: 3, tickedBy: ["a", "b"] }],
      peerIds: ["a", "b"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 7500, b: 7500 });
  });

  it("flags unticked items: ฿0 contribution, negative surplus signals shortfall", () => {
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["a"] },
        { id: "i2", unitPriceSatang: 5000, qty: 1, tickedBy: [] },
      ],
      peerIds: ["a", "b"],
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ a: 10000, b: 0 });
    expect(r.checksumSatang).toBe(10000);
    expect(r.receiptTotalSatang).toBe(15000); // paper receipt still includes i2
    expect(r.surplusSatang).toBe(-5000);
    expect(r.untickedItemIds).toEqual(["i2"]);
    expect(r.itemSplits).toEqual({ i1: { a: 10000 }, i2: {} });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: FAIL — 4 new tests fail (skeleton returns zeros); Task 2 tests still pass

- [ ] **Step 3: Replace the `computeBill` body** (keep `validate` and helpers untouched)

```ts
// src/lib/billing/compute.ts — imports and computeBill become:
import { add, ceilToSatang, frac, mul, ZERO, type Frac } from "./frac";
import type { BillInput, BillResult } from "./types";

export function computeBill(input: BillInput): BillResult {
  validate(input);

  // Per-item net line total. Item discounts arrive in Task 4.
  const itemNet = new Map<string, Frac>();
  for (const item of input.items) {
    itemNet.set(item.id, frac(BigInt(item.unitPriceSatang) * BigInt(item.qty)));
  }

  let subtotal = ZERO;
  for (const net of itemNet.values()) subtotal = add(subtotal, net);

  const ratio = frac(1n); // bill discount arrives in Task 5
  const charge = frac(1n); // SC/VAT arrive in Task 6

  const peerTotalFracs = new Map<string, Frac>(input.peerIds.map((id) => [id, ZERO]));
  const itemSplits: Record<string, Record<string, number>> = {};
  const untickedItemIds: string[] = [];

  for (const item of input.items) {
    itemSplits[item.id] = {};
    if (item.tickedBy.length === 0) {
      untickedItemIds.push(item.id);
      continue;
    }
    const net = itemNet.get(item.id)!;
    const share = mul(
      frac(net.num, net.den * BigInt(item.tickedBy.length)),
      mul(ratio, charge),
    );
    for (const peerId of item.tickedBy) {
      peerTotalFracs.set(peerId, add(peerTotalFracs.get(peerId)!, share));
      itemSplits[item.id][peerId] = ceilToSatang(share); // display only, rounded per cell
    }
  }

  const peerTotals: Record<string, number> = {};
  let checksumSatang = 0;
  for (const [peerId, total] of peerTotalFracs) {
    peerTotals[peerId] = ceilToSatang(total); // the single money rounding (ADR-0001)
    checksumSatang += peerTotals[peerId];
  }

  const receiptTotalSatang = ceilToSatang(mul(subtotal, mul(ratio, charge)));

  return {
    peerTotals,
    checksumSatang,
    receiptTotalSatang,
    surplusSatang: checksumSatang - receiptTotalSatang,
    itemSplits,
    untickedItemIds,
  };
}
```

Note: the empty-bill test from Task 2 must still pass (empty items → all fractions ZERO → zeros). `itemSplits` for an empty bill stays `{}`.

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/compute.ts src/lib/billing/compute.test.ts
git commit -m "feat: even split with round-up pipeline"
```

---

### Task 4: Item discounts (% first, then amount)

**Files:**
- Modify: `src/lib/billing/compute.ts` (itemNet block only)
- Test: `src/lib/billing/compute.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
describe("item discounts (ADR-0003: % first, then amount)", () => {
  const bill = (items: BillInput["items"]): BillInput => ({
    items,
    peerIds: ["a"],
    serviceChargePct: 0,
    vatPct: 0,
  });

  it("applies percentage discount", () => {
    // 159 baht − 10% = 143.10 (Katsu row 1)
    const r = computeBill(bill([{ id: "i1", unitPriceSatang: 15900, qty: 1, discountPct: 10, tickedBy: ["a"] }]));
    expect(r.peerTotals.a).toBe(14310);
  });

  it("applies % before amount", () => {
    // 200.00 − 10% = 180.00, then − 5.00 = 175.00
    const r = computeBill(
      bill([{ id: "i1", unitPriceSatang: 20000, qty: 1, discountPct: 10, discountAmountSatang: 500, tickedBy: ["a"] }]),
    );
    expect(r.peerTotals.a).toBe(17500);
  });

  it("clamps over-discount to ฿0 instead of throwing (mid-editing state)", () => {
    const r = computeBill(
      bill([{ id: "i1", unitPriceSatang: 10000, qty: 1, discountAmountSatang: 15000, tickedBy: ["a"] }]),
    );
    expect(r.peerTotals.a).toBe(0);
    expect(r.receiptTotalSatang).toBe(0);
  });

  it("carries fractional satang exactly until the final round-up", () => {
    // 100.01 − 3% = 97.0097 baht = 9700.97 satang → ceil 9701
    const r = computeBill(bill([{ id: "i1", unitPriceSatang: 10001, qty: 1, discountPct: 3, tickedBy: ["a"] }]));
    expect(r.peerTotals.a).toBe(9701);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: FAIL — 4 new tests fail (discount fields ignored)

- [ ] **Step 3: Edit the itemNet block.** Replace:

```ts
  const itemNet = new Map<string, Frac>();
  for (const item of input.items) {
    itemNet.set(item.id, frac(BigInt(item.unitPriceSatang) * BigInt(item.qty)));
  }
```

with:

```ts
  // Per-item net line total after item discounts: % first, then amount (ADR-0003).
  const itemNet = new Map<string, Frac>();
  for (const item of input.items) {
    const line = BigInt(item.unitPriceSatang) * BigInt(item.qty);
    const pct = BigInt(item.discountPct ?? 0);
    const amt = BigInt(item.discountAmountSatang ?? 0);
    let num = line * (100n - pct) - amt * 100n;
    if (num < 0n) num = 0n; // over-discount while editing: item clamps to ฿0
    itemNet.set(item.id, frac(num, 100n));
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/compute.ts src/lib/billing/compute.test.ts
git commit -m "feat: item discounts, pct then amount"
```

---

### Task 5: Bill discount, proportional allocation

**Files:**
- Modify: `src/lib/billing/compute.ts` (ratio line only)
- Test: `src/lib/billing/compute.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

```ts
describe("bill discount allocated proportionally (ADR-0003)", () => {
  const twoItems = (billDiscount: BillInput["billDiscount"]): BillInput => ({
    items: [
      { id: "i1", unitPriceSatang: 10000, qty: 1, tickedBy: ["x"] },
      { id: "i2", unitPriceSatang: 20000, qty: 1, tickedBy: ["y"] },
    ],
    peerIds: ["x", "y"],
    billDiscount,
    serviceChargePct: 0,
    vatPct: 0,
  });

  it("allocates an amount discount proportionally", () => {
    // 30.00 off 300.00 → ratio 0.9 → 90.00 / 180.00
    const r = computeBill(twoItems({ amountSatang: 3000 }));
    expect(r.peerTotals).toEqual({ x: 9000, y: 18000 });
    expect(r.receiptTotalSatang).toBe(27000);
  });

  it("allocates a percentage discount proportionally", () => {
    const r = computeBill(twoItems({ pct: 10 }));
    expect(r.peerTotals).toEqual({ x: 9000, y: 18000 });
  });

  it("applies % before amount at bill level too", () => {
    // 300.00 − 10% = 270.00, then − 3.00 = 267.00 → ratio 0.89
    const r = computeBill(twoItems({ pct: 10, amountSatang: 300 }));
    expect(r.peerTotals).toEqual({ x: 8900, y: 17800 });
    expect(r.receiptTotalSatang).toBe(26700);
  });

  it("rounds each allocated share up, surplus goes to organizer", () => {
    // items 10.00 + 20.00, discount 10.00 → ratio 2/3 → 6.6667/13.3334 → 667 + 1334
    const r = computeBill({
      items: [
        { id: "i1", unitPriceSatang: 1000, qty: 1, tickedBy: ["x"] },
        { id: "i2", unitPriceSatang: 2000, qty: 1, tickedBy: ["y"] },
      ],
      peerIds: ["x", "y"],
      billDiscount: { amountSatang: 1000 },
      serviceChargePct: 0,
      vatPct: 0,
    });
    expect(r.peerTotals).toEqual({ x: 667, y: 1334 });
    expect(r.checksumSatang).toBe(2001);
    expect(r.receiptTotalSatang).toBe(2000);
    expect(r.surplusSatang).toBe(1);
  });

  it("clamps bill over-discount to ฿0 (mid-editing state)", () => {
    const r = computeBill(twoItems({ amountSatang: 99999 }));
    expect(r.peerTotals).toEqual({ x: 0, y: 0 });
    expect(r.receiptTotalSatang).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: FAIL — 5 new tests fail (ratio hardcoded to 1)

- [ ] **Step 3: Edit the ratio line.** Replace:

```ts
  const ratio = frac(1n); // bill discount arrives in Task 5
```

with:

```ts
  // Bill discount becomes one ratio applied to every item: proportional allocation (ADR-0003).
  let ratio = frac(1n);
  if (input.billDiscount && subtotal.num > 0n) {
    const pct = BigInt(input.billDiscount.pct ?? 0);
    const amt = BigInt(input.billDiscount.amountSatang ?? 0);
    // discounted subtotal S' = S×(100−pct)/100 − amt; ratio = S'/S (S's den cancels)
    let num = subtotal.num * (100n - pct) - amt * 100n * subtotal.den;
    if (num < 0n) num = 0n; // bill over-discount while editing: bill clamps to ฿0
    ratio = frac(num, 100n * subtotal.num);
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: PASS (22 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/compute.ts src/lib/billing/compute.test.ts
git commit -m "feat: proportional bill discount"
```

---

### Task 6: Service charge then VAT, compounded

**Files:**
- Modify: `src/lib/billing/compute.ts` (charge line only)
- Test: `src/lib/billing/compute.test.ts` (append)

- [ ] **Step 1: Append the failing tests** (the four cases from issue #7)

```ts
describe("service charge then VAT, compounded (ADR-0003)", () => {
  const single = (serviceChargePct: number, vatPct: number, unitPriceSatang = 10000): BillInput => ({
    items: [{ id: "i1", unitPriceSatang, qty: 1, tickedBy: ["a"] }],
    peerIds: ["a"],
    serviceChargePct,
    vatPct,
  });

  it("SC only: 10%", () => {
    expect(computeBill(single(10, 0)).peerTotals.a).toBe(11000);
  });

  it("VAT only: 7%", () => {
    expect(computeBill(single(0, 7)).peerTotals.a).toBe(10700);
  });

  it("5% SC + 7% VAT compound: ×1.05 then ×1.07", () => {
    expect(computeBill(single(5, 7)).peerTotals.a).toBe(11235);
  });

  it("10% SC + 7% VAT compound", () => {
    expect(computeBill(single(10, 7)).peerTotals.a).toBe(11770);
  });

  it("rounds up after compounding: 99.99 × 1.05 × 1.07 = 112.338765 → 112.34", () => {
    expect(computeBill(single(5, 7, 9999)).peerTotals.a).toBe(11234);
  });

  it("compounds after even split: 2500 ÷ 3 × 1.10 × 1.07 → 981 each", () => {
    const r = computeBill({
      items: [{ id: "i1", unitPriceSatang: 2500, qty: 1, tickedBy: ["a", "b", "c"] }],
      peerIds: ["a", "b", "c"],
      serviceChargePct: 10,
      vatPct: 7,
    });
    expect(r.peerTotals).toEqual({ a: 981, b: 981, c: 981 });
    expect(r.checksumSatang).toBe(2943);
    expect(r.receiptTotalSatang).toBe(2943); // 2942.5 → ceil
    expect(r.surplusSatang).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: FAIL — 6 new tests fail (charge hardcoded to 1)

- [ ] **Step 3: Edit the charge line.** Replace:

```ts
  const charge = frac(1n); // SC/VAT arrive in Task 6
```

with:

```ts
  // × (1 + SC%) × (1 + VAT%), compounded in that order (ADR-0003).
  const charge = frac(
    BigInt(100 + input.serviceChargePct) * BigInt(100 + input.vatPct),
    10000n,
  );
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: PASS (28 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/compute.ts src/lib/billing/compute.test.ts
git commit -m "feat: service charge and vat compounding"
```

---

### Task 7: Canonical Katsu fixture + DoD

**Files:**
- Test: `src/lib/billing/compute.test.ts` (append)

The permanent regression test. Data = `split-the-bill-example.csv` (anonymized real bill: 7 items, all −10%, no SC/VAT).

- [ ] **Step 1: Append the fixture test**

```ts
describe("canonical Katsu fixture (split-the-bill-example.csv)", () => {
  const katsu: BillInput = {
    items: [
      { id: "katsu", unitPriceSatang: 15900, qty: 1, discountPct: 10, tickedBy: ["D"] },
      { id: "cheesy-don", unitPriceSatang: 19900, qty: 1, discountPct: 10, tickedBy: ["A"] },
      { id: "chicken-don", unitPriceSatang: 14900, qty: 1, discountPct: 10, tickedBy: ["B"] },
      { id: "add-on-59", unitPriceSatang: 5900, qty: 1, discountPct: 10, tickedBy: ["B"] },
      { id: "add-on-89", unitPriceSatang: 8900, qty: 1, discountPct: 10, tickedBy: ["E"] },
      { id: "a-la-carte-loin", unitPriceSatang: 14900, qty: 1, discountPct: 10, tickedBy: ["E"] },
      { id: "chicken-katsu-set", unitPriceSatang: 19900, qty: 1, discountPct: 10, tickedBy: ["C"] },
    ],
    peerIds: ["A", "B", "C", "D", "E"],
    serviceChargePct: 0,
    vatPct: 0,
  };

  it("reproduces every peer total and the checksum from the real sheet", () => {
    const r = computeBill(katsu);
    expect(r.peerTotals).toEqual({ A: 17910, B: 18720, C: 17910, D: 14310, E: 21420 });
    expect(r.checksumSatang).toBe(90270); // ฿902.70
    expect(r.receiptTotalSatang).toBe(90270);
    expect(r.surplusSatang).toBe(0);
    expect(r.untickedItemIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the fixture test — must pass immediately** (it exercises Tasks 3+4 code)

Run: `npx vitest run src/lib/billing/compute.test.ts`
Expected: PASS (29 tests). If this fails, the pipeline is wrong — STOP and debug, do not adjust the fixture numbers; they come from the real sheet.

- [ ] **Step 3: Run the full DoD**

Run: `npm run check`
Expected: lint 0 errors, typecheck 0 errors, all tests pass (money.test.ts + frac.test.ts + compute.test.ts)

- [ ] **Step 4: Commit**

```bash
git add src/lib/billing/compute.test.ts
git commit -m "test: katsu canonical fixture"
```

---

## Definition of Done

```bash
npm run check
```

Zero errors. All tests green, including the canonical Katsu fixture (A=17910, B=18720, C=17910, D=14310, E=21420, checksum 90270).

After DoD: reviewer pass (`@split-the-bill-reviewer`), then pr-prep. PR body must contain `Closes #7`.
