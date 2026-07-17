# Peer Link Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute task-by-task with checkbox tracking.

**Issue:** #9
**Goal:** Anyone with an open bill link can tick items and toggle paid flags without login, sees other devices' changes within ~2s, and the organizer can lock the bill (ticks freeze, paid flags stay live).
**Architecture:** One migration adds the `locked` status, `bill_peers.paid_at`, two anon write RPCs (`set_tick`, `set_paid`) following the ADR-0006 capability pattern, and broadcast-ping triggers (ADR-0007). `/b/[id]` becomes a server shell + client component that subscribes to `bill:<id>` and refetches `get_bill` on every ping. Layout per the issue-#9 verdict comment: chip list `<lg` (section order flips when locked), matrix `≥lg`.

## Global Constraints (from CLAUDE.md)

- Do NOT modify things not asked for.
- All bill math in `src/lib/billing/` as pure functions; TDD there. No money arithmetic in components.
- Money = integer satang everywhere; `formatSatang` only at display edge.
- Organizer writes = RLS on `auth.uid()`; peer access = capability URL only, never login.
- Supabase is the single source of truth; clients subscribe + refetch, no shadow state.
- Mobile (390×844) and desktop both first-class. Thai copy, `฿1,234.50` amounts, min 12px font.
- Conventional Commits, subject < 50 chars. Branch `feat/9-peer-link` off `main`.
- **`supabase db push` requires explicit USER confirmation — stop and ask before pushing.**

## Layout source (already user-approved)

Port JSX from the prototype branch — do not redesign:

```bash
git show prototype/9-peer-link:src/app/prototype/peer-page/VariantA.tsx   # chip list + lock flip
git show prototype/9-peer-link:src/app/prototype/peer-page/VariantB.tsx   # matrix
git show prototype/9-peer-link:src/app/prototype/peer-page/PrototypePeerPage.tsx  # header/status pill/lock button
```

Paid pill: outline `ยังไม่จ่าย` / filled green `✓ จ่ายแล้ว`. ทุกคน section = compact rows (Variant A style) at every width below the matrix breakpoint; matrix keeps totals + จ่ายแล้ว footer rows.

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260717000000_peer_link.sql` | Create: locked status, paid_at, get_bill rebuild, set_tick/set_paid, broadcast triggers |
| `src/lib/billing/itemShare.ts` (+test) | Create: pure per-ticker share helper (TDD) |
| `src/lib/bills/types.ts` | Modify: `"locked"` in status union; `BillPeerRow.paid_at` |
| `src/lib/bills/getBill.ts` | Create: `GetBillJson` type (moved from `/b/[id]/page.tsx`) + typed `fetchBill()` |
| `src/lib/bills/peer.ts` | Create: `setTick`, `setPaid`, `subscribeBillChanged` |
| `src/lib/bills/mutations.ts` | Modify: add `setBillStatus(billId, "open" \| "locked")` |
| `src/app/b/[id]/page.tsx` | Rewrite: server shell — fetch bill, detect owner, render client |
| `src/app/b/[id]/PeerBill.tsx` | Create: client component — state, realtime, chip list + matrix views |
| `docs/STATUS.md` | Update at the end |

Editor (`/bills/[id]`) stays untouched except nothing — lock button lives on `/b/[id]` (grill decision).

---

### Task 1: Migration

**Files:** Create `supabase/migrations/20260717000000_peer_link.sql`

- [ ] **Step 1: Write the migration**

```sql
-- #9 peer link: locked status, paid flag, anon write RPCs (ADR-0006), broadcast pings (ADR-0007)

alter table bills drop constraint bills_status_check;
alter table bills add constraint bills_status_check
  check (status in ('draft', 'open', 'locked'));

alter table bill_peers add column paid_at timestamptz;

-- get_bill now serves open AND locked (peers must still see a locked bill),
-- returns status + per-peer paidAt. Draft/nonexistent stay null (no enumeration).
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
      'paymentInfo', b.payment_info,
      'paymentMethod', b.payment_method
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

-- Anon tick write. Bill id = capability proof; item + peer must belong to THAT bill.
-- Ticking allowed only while open (locked freezes ticks — grill decision 2026-07-16).
create or replace function set_tick(
  p_bill_id uuid, p_line_item_id uuid, p_peer_id uuid, p_on boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from bills b
    join line_items li on li.bill_id = b.id and li.id = p_line_item_id
    join bill_peers bp on bp.bill_id = b.id and bp.peer_id = p_peer_id
    where b.id = p_bill_id and b.status = 'open'
  ) then
    raise exception 'bill not open or item/peer not on bill';
  end if;

  if p_on then
    insert into ticks (line_item_id, peer_id) values (p_line_item_id, p_peer_id)
    on conflict do nothing;
  else
    delete from ticks where line_item_id = p_line_item_id and peer_id = p_peer_id;
  end if;
end;
$$;

-- Anon paid toggle. Allowed while open OR locked (paying happens after lock).
create or replace function set_paid(
  p_bill_id uuid, p_peer_id uuid, p_paid boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from bills b
    join bill_peers bp on bp.bill_id = b.id and bp.peer_id = p_peer_id
    where b.id = p_bill_id and b.status in ('open', 'locked')
  ) then
    raise exception 'bill not open/locked or peer not on bill';
  end if;

  update bill_peers
  set paid_at = case when p_paid then now() else null end
  where bill_id = p_bill_id and peer_id = p_peer_id;
end;
$$;

revoke all on function set_tick(uuid, uuid, uuid, boolean) from public;
revoke all on function set_paid(uuid, uuid, boolean) from public;
grant execute on function set_tick(uuid, uuid, uuid, boolean) to anon, authenticated;
grant execute on function set_paid(uuid, uuid, boolean) to anon, authenticated;

-- ADR-0007: broadcast an empty "changed" ping to bill:<id> on every write path.
-- Broadcast failure must never abort the write.
create or replace function notify_bill_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill_id uuid;
  rec record;
begin
  rec := coalesce(new, old);
  if tg_table_name = 'bills' then
    v_bill_id := rec.id;
  elsif tg_table_name in ('line_items', 'bill_peers') then
    v_bill_id := rec.bill_id;
  elsif tg_table_name = 'ticks' then
    select li.bill_id into v_bill_id from line_items li where li.id = rec.line_item_id;
  end if;

  if v_bill_id is not null then
    begin
      perform realtime.send('{}'::jsonb, 'changed', 'bill:' || v_bill_id, false);
    exception when others then
      null; -- never block the write on a broadcast failure
    end;
  end if;
  return null;
end;
$$;

create trigger ticks_notify after insert or delete on ticks
  for each row execute function notify_bill_changed();
create trigger bill_peers_notify after insert or update or delete on bill_peers
  for each row execute function notify_bill_changed();
create trigger bills_notify after update on bills
  for each row execute function notify_bill_changed();
create trigger line_items_notify after insert or update or delete on line_items
  for each row execute function notify_bill_changed();
```

- [ ] **Step 2: STOP — ask the user to approve `supabase db push` (never push unasked). After approval:**

Run: `supabase db push`
Expected: `20260717000000_peer_link.sql` applied, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260717000000_peer_link.sql
git commit -m "feat(db): locked status, paid flag, peer RPCs"
```

---

### Task 2: Pure per-ticker share helper (TDD)

**Files:** Create `src/lib/billing/itemShare.ts`, `src/lib/billing/itemShare.test.ts`

**Interfaces:** Produces `itemShareSatang(item: { unitPriceSatang: number; qty: number; discountPercent?: number; discountAmountSatang?: number; tickedBy: string[] }): number | null` — the display amount "each ticker pays for this item" (item total after its own discounts, ceil-divided by tickers), `null` when nobody ticked. Components must use this, never inline math.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { itemShareSatang } from "./itemShare";

describe("itemShareSatang", () => {
  it("returns null when nobody ticked", () => {
    expect(itemShareSatang({ unitPriceSatang: 10000, qty: 1, tickedBy: [] })).toBeNull();
  });

  it("splits item total after percent discount, rounded up", () => {
    // 159.00 × 1 − 10% = 143.10 → ÷2 = 71.55
    expect(
      itemShareSatang({ unitPriceSatang: 15900, qty: 1, discountPercent: 10, tickedBy: ["a", "b"] }),
    ).toBe(7155);
  });

  it("applies qty and amount discount, ceils the split", () => {
    // 59.00 × 2 − 0.01 = 117.99 → ÷2 = 59.00 round-up (5899.5 → 5900)
    expect(
      itemShareSatang({ unitPriceSatang: 5900, qty: 2, discountAmountSatang: 1, tickedBy: ["a", "b"] }),
    ).toBe(5900);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/billing/itemShare.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/** Display-only per-ticker share of one line item (its own discounts applied). */
export function itemShareSatang(item: {
  unitPriceSatang: number;
  qty: number;
  discountPercent?: number;
  discountAmountSatang?: number;
  tickedBy: string[];
}): number | null {
  const n = item.tickedBy.length;
  if (n === 0) return null;
  const gross = item.unitPriceSatang * item.qty;
  const afterPercent = Math.round(gross * (1 - (item.discountPercent ?? 0) / 100));
  const total = afterPercent - (item.discountAmountSatang ?? 0);
  return Math.ceil(total / n);
}
```

- [ ] **Step 4: Run the test again** — expect PASS. Then `npm run check` — zero errors.

- [ ] **Step 5: Commit** `git commit -m "feat(billing): per-ticker item share helper"`

---

### Task 3: Types + typed peer client

**Files:** Modify `src/lib/bills/types.ts`; create `src/lib/bills/getBill.ts`, `src/lib/bills/peer.ts`; modify `src/lib/bills/mutations.ts`

**Interfaces:** Produces `fetchBill(client, billId): Promise<GetBillJson | null>`, `setTick(billId, lineItemId, peerId, on)`, `setPaid(billId, peerId, paid)`, `subscribeBillChanged(billId, onPing): () => void`, `setBillStatus(billId, status)`.

- [ ] **Step 1: types.ts** — status union becomes `"draft" | "open" | "locked"`. (Header says rows mirror migrations exactly; `paid_at` lives on bill_peers which has no row type — the RPC JSON carries it instead.)

- [ ] **Step 2: getBill.ts** — move the `GetBillJson` interface out of `src/app/b/[id]/page.tsx` verbatim, add `status: "open" | "locked"` to `bill` and `paidAt: string | null` to peers, and:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchBill(
  client: SupabaseClient,
  billId: string,
): Promise<GetBillJson | null> {
  const { data } = await client.rpc("get_bill", { p_bill_id: billId });
  return (data as GetBillJson | null) ?? null;
}
```

- [ ] **Step 3: peer.ts** — anon writes + subscription (browser client):

```ts
import { createClient } from "@/lib/supabase/client";

export async function setTick(
  billId: string, lineItemId: string, peerId: string, on: boolean,
): Promise<void> {
  const { error } = await createClient().rpc("set_tick", {
    p_bill_id: billId, p_line_item_id: lineItemId, p_peer_id: peerId, p_on: on,
  });
  if (error) throw new Error(`setTick: ${error.message}`);
}

export async function setPaid(
  billId: string, peerId: string, paid: boolean,
): Promise<void> {
  const { error } = await createClient().rpc("set_paid", {
    p_bill_id: billId, p_peer_id: peerId, p_paid: paid,
  });
  if (error) throw new Error(`setPaid: ${error.message}`);
}

/** ADR-0007: subscribe to the bill's ping channel; returns unsubscribe. */
export function subscribeBillChanged(billId: string, onPing: () => void): () => void {
  const client = createClient();
  const channel = client
    .channel(`bill:${billId}`)
    .on("broadcast", { event: "changed" }, onPing)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
```

- [ ] **Step 4: mutations.ts** — replace `publishBill` with a general status setter, keep the old name as a one-liner so the editor is untouched:

```ts
export async function setBillStatus(
  billId: string,
  status: "open" | "locked",
): Promise<void> {
  const { error } = await createClient().from("bills").update({ status }).eq("id", billId);
  if (error) fail("setBillStatus", error);
}

export async function publishBill(billId: string): Promise<void> {
  return setBillStatus(billId, "open");
}
```

- [ ] **Step 5:** `npm run check` — zero errors (page.tsx still compiles against the moved type via next task if needed; if it breaks now, do Task 4 Step 1 first, then rerun).

- [ ] **Step 6: Commit** `git commit -m "feat(bills): peer RPC client + locked status"`

---

### Task 4: `/b/[id]` rebuild — server shell + realtime client

**Files:** Rewrite `src/app/b/[id]/page.tsx`; create `src/app/b/[id]/PeerBill.tsx`

**Interfaces:** Consumes Task 2's `itemShareSatang`, Task 3's `fetchBill` / `setTick` / `setPaid` / `subscribeBillChanged` / `setBillStatus`, `computeBill`, `formatSatang`.

- [ ] **Step 1: page.tsx (server)** — fetch via `fetchBill(await createClient(), id)` (server client). Null → keep the existing "บิลนี้ยังไม่เปิด หรือไม่มีอยู่" block verbatim (grill decision: combined message stays). Otherwise detect owner — authed RLS read, returns a row only for the organizer:

```ts
const { data: ownedRow } = await supabase
  .from("bills").select("id").eq("id", id).maybeSingle();
const isOwner = ownedRow !== null;
```

Render `<PeerBill billId={id} initial={json} isOwner={isOwner} />`. Delete the old static rendering and the "coming in #9" banner.

- [ ] **Step 2: PeerBill.tsx (client)** — structure:

```tsx
"use client";
// State: const [bill, setBill] = useState(initial); const [pending, setPending] = useState(false);
// Realtime: useEffect(() => subscribeBillChanged(billId, refetch), [billId]);
//   refetch = fetchBill(createClient(), billId) → setBill (ignore null: keep last state).
// Derived: BillInput built exactly like the old page.tsx (sort by position, tickedBy map),
//   result = useMemo(computeBill), locked = bill.bill.status === "locked".
// Actions (optimistic: patch local state first, then RPC; on RPC error → refetch):
//   onTick(itemId, peerId)  → guard locked; setTick(...)
//   onPaid(peerId)          → setPaid(...)
//   onLockToggle()          → setBillStatus(billId, locked ? "open" : "locked"); refetch
// Views (port JSX from prototype, see "Layout source" above):
//   <lg  : chip list — items section + ทุกคน rows; order FLIPS when locked (VariantA)
//   ≥lg  : matrix — items × peers grid, totals + จ่ายแล้ว footer rows (VariantB)
//   Responsive via the same lg: utility split the #8 editor uses (hidden lg:block / lg:hidden).
// Header: restaurant, Thai date, status pill (เปิดอยู่ / ล็อกแล้ว), owner-only lock button,
//   locked banner text from PrototypePeerPage.
// Per-item split display: itemShareSatang(item) — NEVER inline math.
// Keep the โอนคืนที่ payment section from the old page (paymentMethod · paymentInfo).
```

Real code requirements beyond the prototype port: tick buttons get `disabled={locked || pending}` only during that item's in-flight RPC if simple (a single global `pending` is acceptable); `aria-label` on matrix cells (`${peer.name} — ${item.name}`); min tap target 40px as in the prototype.

- [ ] **Step 3:** `npm run check` — zero errors, 50 tests green (47 + 3 new).

- [ ] **Step 4: Manual smoke (dev server):** publish a bill as organizer, open `/b/[id]` in a second browser (incognito, not signed in): tick → both browsers update ≤2s; toggle paid; owner locks → chips freeze + sections flip in incognito; unlock restores; draft bill link still shows the combined message.

- [ ] **Step 5: Commit** `git commit -m "feat(peer): live tick, paid, lock on /b/[id]"`

---

### Task 5: Docs + wrap

- [ ] `docs/STATUS.md`: #9 row → IN REVIEW, phase header mentions peer link shipped-pending-review. Decision Log line: `| 2026-07-17 | #9: locked = ticks frozen only, paid stays live; realtime = broadcast ping + refetch (ADR-0007) | postgres_changes dead for anon under ADR-0006; lock/pay ordering | User + main session |`
- [ ] `CHANGELOG.md` `[Unreleased]`: peer ticking without login, live sync, paid flags, bill lock.
- [ ] `npm run check` final run — zero errors.
- [ ] Commit `docs: status + changelog for #9`.

## Definition of Done

```
npm run check   # lint + typecheck + unit tests — ZERO errors
```

Plus: billing helper has TDD coverage (Task 2); peer flows verified at 390×844 AND desktop (Task 4 Step 4); Katsu fixture still green.

## Out of scope (do NOT touch)

- QR / copy-amount / paid attribution (#10), Soft Claim (BACKLOG), UI revamp (#15), editor layout, `prototype/` routes (throwaway branch), `src/lib/billing/compute.ts` internals.
