# Organizer Bill Editor Implementation Plan

> **For agentic workers:** execute task-by-task with the checkbox steps. Run `npm run check` before every commit.

**Issue:** #8
**Goal:** A signed-in organizer creates a draft bill, edits items/peers/rates with autosave, ticks the matrix with live engine totals + receipt checksum, and publishes to activate the capability link.
**Architecture:** Supabase migration (5 tables + profiles, RLS, `get_bill` RPC per ADR-0005/0006) → thin client data layer (row types, `BillInput` mapper, mutation functions) → one responsive editor page (matrix ≥lg, stacked cards <lg per the issue-#8 prototype verdict) computing totals client-side via the untouched #7 engine. Design tokens from DESIGN.md land first so all UI is built with them.

## Primary sources

- **Layout + markup reference:** branch `prototype/8-bill-editor` → `src/app/prototype/bill-editor/` (VariantA = desktop matrix, VariantB = mobile cards, BillMetaFields). Rebuild properly with tokens; do NOT copy prototype code verbatim (it was written under prototype constraints).
- **Design tokens:** `DESIGN.md` (exact hex values, contrast rules, component vocabulary).
- **Decisions:** ADR-0005 (schema/autosave), ADR-0006 (anon RPC), issue #8 comments (layout verdict).

## Global Constraints (from CLAUDE.md — every task inherits)

- Do NOT modify anything not asked for; all bill math stays in `src/lib/billing/` (this ticket only *consumes* `computeBill` — zero changes there).
- Money is integer satang everywhere; `formatSatang` at the display edge only; never float arithmetic on money.
- Organizer data behind RLS on `auth.uid()`; nothing peer-facing requires login; anon access only via `get_bill` RPC.
- Supabase is the single source of truth: autosave-per-action, no client shadow state beyond the currently-rendered props/optimistic toggle.
- Responsive: mobile one-handed AND desktop both first-class; WCAG AA (PRODUCT.md).
- Conventional Commits, subject <50 chars. DoD = `npm run check` zero errors.

## File Map

| File | Responsibility |
|---|---|
| `src/app/globals.css` | **M** — replace starter tokens with DESIGN.md palette (light theme only) |
| `src/app/layout.tsx` | **M** — Noto Sans Thai via `next/font/google` |
| `supabase/migrations/20260715_bills.sql` | **C** — tables, RLS, `get_bill` RPC (applied manually by user) |
| `src/lib/bills/types.ts` | **C** — DB row types (`BillRow`, `LineItemRow`, `PeerRow`, `TickRow`) |
| `src/lib/bills/mapper.ts` | **C** — rows → `BillInput` (pure, tested) |
| `src/lib/bills/mapper.test.ts` | **C** — mapper unit tests |
| `src/lib/bills/mutations.ts` | **C** — all writes (browser supabase client), one function per action |
| `src/app/dashboard/page.tsx` | **M** — bill list + New Bill action |
| `src/app/bills/[id]/page.tsx` | **C** — server component: auth guard + initial fetch |
| `src/app/bills/[id]/BillEditor.tsx` | **C** — client: state, autosave calls, computeBill, layout switch |
| `src/app/bills/[id]/MatrixView.tsx` | **C** — desktop ≥lg matrix (items rows × peer columns) |
| `src/app/bills/[id]/CardsView.tsx` | **C** — mobile <lg stacked cards + sticky totals bar |
| `src/app/bills/[id]/PeerPicker.tsx` | **C** — recent-first chips + add-by-typing |
| `src/app/b/[id]/page.tsx` | **C** — minimal published-bill view via anon `get_bill` (proves RPC; full peer UX is #9) |
| `docs/BACKLOG.md` | **M** — deferred: dark mode, per-peer pipeline breakdown rows, initials chips >8 peers |
| `docs/STATUS.md` | **M** — phase + #8 row on completion |

---

### Task 1: Design tokens + Thai font

**Files:** Modify `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Replace globals.css** with the DESIGN.md tokens (light theme only; delete the `prefers-color-scheme: dark` block — dark mode is BACKLOG):

```css
@import "tailwindcss";

:root {
  --color-brand: #0cc0df; /* decorative anchor only — never under text */
  --color-primary: #069ec8; /* white BOLD >=14px text only (3.1:1) */
  --color-primary-deep: #0782a5;
  --color-primary-ink: #0e7490; /* small primary text / links on light */
  --color-bg: #e6f7fb;
  --color-surface: #ffffff;
  --color-surface-tint: #d8f3f9;
  --color-border: #bee9f2;
  --color-ink: #123c4a;
  --color-ink-muted: #4b6e7a;
  --color-success: #059669;
  --color-danger: #dc2626;
  --color-warning-ink: #b45309;
}

@theme inline {
  --color-brand: var(--color-brand);
  --color-primary: var(--color-primary);
  --color-primary-deep: var(--color-primary-deep);
  --color-primary-ink: var(--color-primary-ink);
  --color-bg: var(--color-bg);
  --color-surface: var(--color-surface);
  --color-surface-tint: var(--color-surface-tint);
  --color-border: var(--color-border);
  --color-ink: var(--color-ink);
  --color-ink-muted: var(--color-ink-muted);
  --color-success: var(--color-success);
  --color-danger: var(--color-danger);
  --color-warning-ink: var(--color-warning-ink);
  --font-sans: var(--font-noto-sans-thai);
}

body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-noto-sans-thai), sans-serif;
}
```

(Tailwind 4 `@theme inline` exposes these as `bg-primary`, `text-ink-muted`, `border-border`, etc.)

- [ ] **Step 2: Load Noto Sans Thai** in `src/app/layout.tsx` — replace the Geist fonts:

```tsx
import { Noto_Sans_Thai } from "next/font/google";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-thai",
});
// <html lang="th"> ... <body className={`${notoSansThai.variable} antialiased`}>
```

- [ ] **Step 3: Restyle the two existing pages** (`src/app/page.tsx` landing, `src/app/dashboard/page.tsx`) minimally to the tokens (bg, ink, primary button) so nothing renders in stale starter colors.
- [ ] **Step 4:** `npm run check` → zero errors; `npm run dev` → landing + dashboard render washed-cyan with Thai-capable font.
- [ ] **Step 5:** Commit `feat(ui): design tokens and thai font`

### Task 2: Schema, RLS, get_bill RPC

**Files:** Create `supabase/migrations/20260715_bills.sql`

- [ ] **Step 1: Write the migration** (full SQL below — this is the contract; keep names exact):

```sql
-- Split the Bill: #8 schema (ADR-0005) + anon door (ADR-0006)
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payment_info text not null default ''
);

create table peers (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  last_used_at timestamptz not null default now(),
  unique (organizer_id, name)
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users (id) on delete cascade,
  restaurant text not null default '',
  eaten_at date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'open')),
  bill_discount_percent int not null default 0 check (bill_discount_percent between 0 and 100),
  bill_discount_satang int not null default 0 check (bill_discount_satang >= 0),
  service_charge_percent int not null default 0 check (service_charge_percent between 0 and 100),
  vat_percent int not null default 0 check (vat_percent between 0 and 100),
  receipt_total_satang int not null default 0 check (receipt_total_satang >= 0),
  payment_info text not null default '',
  created_at timestamptz not null default now()
);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills (id) on delete cascade,
  name text not null default '',
  unit_price_satang int not null default 0 check (unit_price_satang >= 0),
  qty int not null default 1 check (qty >= 1),
  discount_percent int not null default 0 check (discount_percent between 0 and 100),
  discount_satang int not null default 0 check (discount_satang >= 0),
  position int not null default 0
);

create table bill_peers (
  bill_id uuid not null references bills (id) on delete cascade,
  peer_id uuid not null references peers (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (bill_id, peer_id)
);

create table ticks (
  line_item_id uuid not null references line_items (id) on delete cascade,
  peer_id uuid not null references peers (id) on delete cascade,
  primary key (line_item_id, peer_id)
);

-- RLS: organizer-only on every table; anon gets NOTHING except the RPC.
alter table profiles enable row level security;
alter table peers enable row level security;
alter table bills enable row level security;
alter table line_items enable row level security;
alter table bill_peers enable row level security;
alter table ticks enable row level security;

create policy "own profile" on profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own peers" on peers for all to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "own bills" on bills for all to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());
create policy "own line_items" on line_items for all to authenticated
  using (exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid()))
  with check (exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid()));
create policy "own bill_peers" on bill_peers for all to authenticated
  using (exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid()))
  with check (
    exists (select 1 from bills b where b.id = bill_id and b.organizer_id = auth.uid())
    and exists (select 1 from peers p where p.id = peer_id and p.organizer_id = auth.uid())
  );
create policy "own ticks" on ticks for all to authenticated
  using (exists (
    select 1 from line_items li join bills b on b.id = li.bill_id
    where li.id = line_item_id and b.organizer_id = auth.uid()
  ))
  with check (
    exists (
      select 1 from line_items li join bills b on b.id = li.bill_id
      where li.id = line_item_id and b.organizer_id = auth.uid()
    )
    and exists (select 1 from peers p where p.id = peer_id and p.organizer_id = auth.uid())
  );

-- ADR-0006: the ONLY anonymous door. One id in, one open bill out, no enumeration.
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
      'billDiscountPercent', b.bill_discount_percent,
      'billDiscountSatang', b.bill_discount_satang,
      'serviceChargePercent', b.service_charge_percent,
      'vatPercent', b.vat_percent,
      'receiptTotalSatang', b.receipt_total_satang,
      'paymentInfo', b.payment_info
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
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb)
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
  where b.id = p_bill_id and b.status = 'open';
$$;

revoke all on function get_bill(uuid) from public;
grant execute on function get_bill(uuid) to anon, authenticated;
```

- [ ] **Step 2 — USER ACTION (checkpoint, stop and ask):** paste the migration into the Supabase SQL editor and run it. Do not proceed until the user confirms it ran without error.
- [ ] **Step 3: Verify the anon door** — with the publishable key only (no session), `supabase.rpc('get_bill', { p_bill_id: '<random uuid>' })` returns `null`, and `supabase.from('bills').select()` returns an empty result/permission error (tables closed).
- [ ] **Step 4:** Commit `feat(db): bills schema, rls, get_bill rpc`

### Task 3: Row types + BillInput mapper (TDD)

**Files:** Create `src/lib/bills/types.ts`, `src/lib/bills/mapper.ts`, `src/lib/bills/mapper.test.ts`

**Interfaces — Produces (later tasks rely on these exact names):**

```ts
// types.ts
export interface BillRow {
  id: string; restaurant: string; eaten_at: string; status: "draft" | "open";
  bill_discount_percent: number; bill_discount_satang: number;
  service_charge_percent: number; vat_percent: number;
  receipt_total_satang: number; payment_info: string;
}
export interface LineItemRow {
  id: string; bill_id: string; name: string; unit_price_satang: number;
  qty: number; discount_percent: number; discount_satang: number; position: number;
}
export interface PeerRow { id: string; name: string; last_used_at?: string }
export interface TickRow { line_item_id: string; peer_id: string }

// mapper.ts
export function mapToBillInput(
  bill: BillRow, items: LineItemRow[], peers: PeerRow[], ticks: TickRow[],
): BillInput
```

- [ ] **Step 1: Write failing tests** — `mapper.test.ts`: (a) maps a 2-item, 2-peer, 3-tick fixture to a valid `BillInput` that `computeBill` accepts (assert a known total); (b) zero discounts map to the DB defaults `0` (engine treats 0 as no-op — pass them through, do NOT convert to `undefined`); (c) items ordered by `position`; (d) item with no ticks → `tickedBy: []`.
- [ ] **Step 2:** `npm run test` → FAIL (mapper not implemented).
- [ ] **Step 3: Implement** `mapToBillInput`: sort items by `position`, build `tickedBy` from ticks grouped by `line_item_id`, `peerIds` from peers, `billDiscount: { percent, amountSatang }` from bill columns.
- [ ] **Step 4:** `npm run check` → green. Commit `feat(bills): row types and billinput mapper`

### Task 4: Mutations layer

**Files:** Create `src/lib/bills/mutations.ts`

One exported async function per user action, all thin wrappers over the browser supabase client (`@/lib/supabase/client`), all throwing on Supabase error. **Produces (exact signatures):**

```ts
export async function createBill(): Promise<string> // returns new bill id
export async function updateBill(billId: string, patch: Partial<Pick<BillRow,
  "restaurant" | "eaten_at" | "bill_discount_percent" | "bill_discount_satang" |
  "service_charge_percent" | "vat_percent" | "receipt_total_satang" | "payment_info">>): Promise<void>
export async function publishBill(billId: string): Promise<void> // status -> 'open'
export async function addLineItem(billId: string, position: number): Promise<LineItemRow>
export async function updateLineItem(itemId: string, patch: Partial<Pick<LineItemRow,
  "name" | "unit_price_satang" | "qty" | "discount_percent" | "discount_satang">>): Promise<void>
export async function deleteLineItem(itemId: string): Promise<void>
export async function listRecentPeers(): Promise<PeerRow[]> // order last_used_at desc, limit 20
export async function addPeerToBill(billId: string, name: string): Promise<PeerRow>
  // upsert peers on (organizer_id, name), touch last_used_at, insert bill_peers
export async function removePeerFromBill(billId: string, peerId: string): Promise<void>
  // delete bill_peers row + that peer's ticks on this bill's items
export async function toggleTick(lineItemId: string, peerId: string, ticked: boolean): Promise<void>
```

- [ ] **Step 1:** Implement all functions. `addPeerToBill` gets `organizer_id` via `supabase.auth.getUser()`. No unit tests (thin I/O; RLS + Task 2 Step 3 cover the contract); the editor smoke test exercises them.
- [ ] **Step 2:** `npm run check` → green. Commit `feat(bills): mutation layer`

### Task 5: Dashboard list + create draft

**Files:** Modify `src/app/dashboard/page.tsx`

- [ ] **Step 1:** Server component: fetch `bills` (own, order `created_at` desc) with server client; render list rows — restaurant (or "ยังไม่มีชื่อร้าน"), Thai-formatted date, status chip (draft = tint, open = success), each linking to `/bills/[id]`. Empty state: "ยังไม่มีบิล — สร้างบิลแรกของคุณ" teaching line + button.
- [ ] **Step 2:** "New bill" = form + server action: insert `bills` row (defaults), `redirect(/bills/${id})`. Primary button style (bg-primary, bold white).
- [ ] **Step 3:** Manual check: create → land on editor route (404 until Task 6 — acceptable mid-task), row appears on dashboard.
- [ ] **Step 4:** `npm run check` → green. Commit `feat(dashboard): bill list and create draft`

### Task 6: Editor shell + bill meta + items CRUD (autosave)

**Files:** Create `src/app/bills/[id]/page.tsx`, `src/app/bills/[id]/BillEditor.tsx`

- [ ] **Step 1:** `page.tsx` (server): auth guard (`redirect("/")`), fetch bill + line_items + bill_peers→peers + ticks + recent peers + profile in parallel; 404 if not found/not owner (RLS returns empty). Pass all rows as props.
- [ ] **Step 2:** `BillEditor.tsx` (client): holds rows in `useState`, seeds from props. Every edit = optimistic local update + fire the matching mutation (autosave per ADR-0005; text/number fields save on blur, structural actions save immediately). On mutation failure: revert + inline error line.
- [ ] **Step 3:** Header block — restaurant name (inline input), date, status chip. Meta block — bill discount %/฿, SC %, VAT %, receipt total ฿, payment info (defaults from profile on bill creation, editable per bill). ฿ fields accept decimal text, convert via `Math.round(parseFloat * 100)` at the input edge, display via `formatSatang`.
- [ ] **Step 4:** Items — add (appends row via `addLineItem`), inline edit name/price/qty/discounts, delete. Duplicate dish names allowed (rows are independent).
- [ ] **Step 5:** Wire `computeBill(mapToBillInput(...))` in a `useMemo`; render checksum + receipt ✓/✗ bar (icon + text, success/danger tokens) — totals visible even before peers exist (all-unticked → ฿0 + flags).
- [ ] **Step 6:** `npm run check` green; manual: edit a field, reload page → value persisted (autosave proof). Commit `feat(editor): shell, meta and items autosave`

### Task 7: Peers, ticking, both layouts, live totals

**Files:** Create `src/app/bills/[id]/PeerPicker.tsx`, `MatrixView.tsx`, `CardsView.tsx`; modify `BillEditor.tsx`

- [ ] **Step 1:** `PeerPicker` — recent-first chips of saved peers not yet on the bill (tap = `addPeerToBill`), text input "เพิ่มเพื่อน…" adds new (creates record), on-bill peers shown as removable chips. All chips ≥44px touch target.
- [ ] **Step 2:** `MatrixView` (rendered ≥lg) — per prototype VariantA + DESIGN.md: items as rows (name, net price, −n% badge), peers as columns, tick cell buttons (primary fill when ticked, ✓ glyph), sticky first column + header, footer rows: per-peer totals (`formatSatang`, tabular-nums), checksum. Unticked item rows flag danger text.
- [ ] **Step 3:** `CardsView` (rendered <lg) — per prototype VariantB: card per item, peer name chips (idle tint / ticked primary bold), `÷ n = ฿x each` muted line (from `itemSplits`), unticked card gets danger border + line. Sticky bottom bar: checksum + receipt ✓/✗ always visible, expands to per-peer totals list. Keep body `pb-*` clearance for the bar.
- [ ] **Step 4:** Tick toggle path: optimistic `tickedBy` update → `toggleTick` → totals recompute via the Task 6 `useMemo` (must feel instant).
- [ ] **Step 5:** Layout switch in `BillEditor`: render both views with `hidden lg:block` / `lg:hidden` (state lives above, so no double-fetch).
- [ ] **Step 6:** Manual smoke on real phone viewport + desktop: tick/untick updates totals live; checksum matches a hand-checked Katsu-style bill; one-handed reach for chips and bottom bar.
- [ ] **Step 7:** `npm run check` green. Commit `feat(editor): peers, ticking, live totals`

### Task 8: Publish + capability link + minimal /b/[id]

**Files:** Modify `BillEditor.tsx`; create `src/app/b/[id]/page.tsx`

- [ ] **Step 1:** Publish button (the ONE loud element; disabled with reason while bill has zero items): `publishBill` → status chip flips to "open", link panel appears: `/b/{id}` full URL + copy button ("คัดลอกลิงก์แล้ว ✓" feedback).
- [ ] **Step 2:** `/b/[id]/page.tsx` (server, **no auth**): anon server client calls `.rpc("get_bill", { p_bill_id: params.id })`. `null` → "บิลนี้ยังไม่เปิด หรือไม่มีอยู่" (draft link inactive ✓). Else render read-only summary: restaurant, items with per-peer totals via `computeBill` (map the JSON through `mapToBillInput` shapes), payment info. Banner: "peer ticking arrives in #9".
- [ ] **Step 3:** Manual: draft URL shows inactive message; after publish, URL renders; totals match editor.
- [ ] **Step 4:** `npm run check` green. Commit `feat(bills): publish flow and capability link`

### Task 9: AA pass + docs

- [ ] **Step 1:** Sweep: `focus-visible` rings (primary-ink) on all interactive elements; touch targets ≥44px; ✓/✗ never color-only; white-on-primary text is bold ≥14px; `prefers-reduced-motion` guard on any transition added.
- [ ] **Step 2:** `docs/BACKLOG.md` Polish additions: dark mode; per-peer pipeline breakdown rows under the matrix (needs engine to expose intermediates — new grill); initial-only chips for >8 peers; peer page full UX (#9 covers).
- [ ] **Step 3:** `docs/STATUS.md`: phase line + #8 row → note "in review" (DONE only after merge).
- [ ] **Step 4:** `npm run check` green. Commit `chore: aa sweep and docs for #8`

## Definition of Done

```
npm run check
```

Zero errors, all tests green (existing 43 + new mapper tests). Peer-facing `/b/[id]` verified on a mobile viewport. Acceptance criteria on issue #8 all demonstrably true on the dev server.

## Impact Map

No IMPACT-MAP doc in this project. Core-logic statement: `src/lib/billing/` is **not modified** — this ticket only consumes `computeBill`/`formatSatang`. The canonical Katsu fixture contract holds untouched.
