# Organizer Self-Peer Implementation Plan

**Issue:** #24
**Goal:** The organizer joins their own bill and ticks the items they ate, without the "create a peer named after myself" workaround.
**Architecture:** The organizer becomes a real `peers` row marked by `peers.linked_user_id = organizer_id` (the column ADR-0005 reserved for #12), auto-created on bill creation and reused across bills. It is arithmetically an ordinary peer, so `src/lib/billing/` is untouched. It differs only at the edges: named from a new `profiles.display_name`, badged in the editor, and on the shared peer link it is visible but not claimable, with no QR and no Paid Flag.

**Read `docs/adr/0010-organizer-joins-as-marked-self-peer.md` first.** Every "why" in this plan lives there.

## Global Constraints (from `CLAUDE.md`)

- **Do not modify things not asked for.** If unsure, ask.
- **All bill math lives in `src/lib/billing/` as pure functions.** This plan changes none of it. If you find yourself editing `compute.ts`, stop: the self-peer is an ordinary peer to the engine.
- **Money is integer satang everywhere.** Not exercised here, but do not introduce float money anywhere.
- **Two access modes, one rule:** organizer data is protected by RLS on `auth.uid()`; peers get capability-URL access only. Nothing peer-facing may require login.
- **Supabase is the single source of truth.** No client-side shadow state.
- **Responsive, mobile and desktop both first-class.** Verify the peer link at 320px, not just desktop.
- **No em dashes in UI copy.** UI copy is Thai.
- **Conventional Commits**, subject under 50 chars. Branch `feat/24-self-peer` off `main`.

## Deploy ordering (read before Task 1)

This migration is the **#26 shape, not the #10 shape**: it adds what the new code reads, so it must run **before** the Vercel deploy. Migrations are manual, Vercel deploys on merge. Therefore:

- `isSelf` on the `get_bill` payload is typed **optional**, and a missing value degrades the row to an ordinary peer. It must never throw during SSR.
- `display_name` is read with `?? ""` fallbacks for the same reason.
- Apply the migration **before** merging the PR (the user applies it, or explicitly asks you to).

## File Map

| File | Created / Modified | Responsible for |
|---|---|---|
| `supabase/migrations/<ts>_self_peer.sql` | **created** | `peers.linked_user_id`, `profiles.display_name`, `get_bill` returning `isSelf` |
| `src/lib/bills/displayName.ts` | **created** | Pure `resolveDisplayName` fallback chain |
| `src/lib/bills/displayName.test.ts` | **created** | Its tests (TDD, written first) |
| `src/lib/bills/types.ts` | modified | `ProfileRow.display_name`, `PeerRow.linked_user_id` |
| `src/lib/bills/getBill.ts` | modified | Optional `isSelf` on the peers payload |
| `src/app/profile/page.tsx` | modified | Select + default `display_name` |
| `src/app/profile/ProfileForm.tsx` | modified | ชื่อที่แสดงในบิล input |
| `src/app/profile/actions.ts` | modified | Rename the self-peer when the display name changes |
| `src/app/dashboard/actions.ts` | modified | Auto-add the self-peer on bill creation |
| `src/app/bills/[id]/page.tsx` | modified | Select `linked_user_id`, derive `selfPeerId` |
| `src/app/bills/[id]/BillEditor.tsx` | modified | Thread `selfPeerId` to the three views |
| `src/app/bills/[id]/PeerPicker.tsx` | modified | คุณ badge on the self chip |
| `src/app/bills/[id]/MatrixView.tsx` | modified | คุณ badge in the column header |
| `src/app/bills/[id]/CardsView.tsx` | modified | คุณ badge in the totals list |
| `src/app/b/[id]/PeerBill.tsx` | modified | Self row visible, not claimable, no payback |
| `CHANGELOG.md`, `package.json`, `docs/STATUS.md` | modified | v0.5.0 release docs |

**Untouched, deliberately:** everything in `src/lib/billing/`, `mutations.ts`'s `addPeerToBill` / `removePeerFromBill` (removing yourself already works), and the `set_tick` / `set_paid` RPCs.

---

## Task 1 — Migration: mark the self-peer, name the organizer

- [ ] Create the file with the CLI, never by hand:

```bash
supabase migration new self_peer
```

- [ ] Write this into the generated file:

```sql
-- #24 / ADR-0010: the organizer joins their own bill as a marked self-peer.
--
-- linked_user_id is the column ADR-0005 reserved for peer accounts. It carries
-- one meaning in both uses: this Peer record IS that auth user. The organizer's
-- self-peer is a pre-claimed peer, so #12's Account Claim inherits the column.
--
-- on delete set null, NOT cascade: if a claimed peer's account is ever deleted,
-- the organizer keeps the contact and its history. The organizer's own self-peer
-- is removed anyway by the existing organizer_id cascade.
alter table peers add column linked_user_id uuid references auth.users (id) on delete set null;

-- At most one row per (organizer, linked user): one self-peer per organizer, and
-- #12's "claim once per organizer". Partial, so ordinary peers stay unconstrained.
create unique index peers_one_row_per_linked_user
  on peers (organizer_id, linked_user_id)
  where linked_user_id is not null;

-- The organizer's peer-facing name. Not account_name, which is the bank account
-- holder name shown for payer confirmation (ADR-0009).
alter table profiles add column display_name text not null default '';

-- get_bill gains isSelf so the peer view can suppress claim + payback on the
-- organizer's row. Everything else is copied verbatim from 20260726000000.
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

- [ ] **Do not apply it yourself.** Confirm with the user first (prod migrations need explicit approval per `CLAUDE.md`). When approved, use the **global** `supabase` CLI, never `npx supabase`:

```bash
supabase migration list --linked
supabase db push --linked --dry-run    # confirm ONLY this file is pending
supabase db push --linked --yes
```

- [ ] Verify afterwards rather than trusting the exit message. Booleans and counts only, so no bill or peer data is printed:

```bash
supabase db query --linked "
select
  exists (select 1 from information_schema.columns
          where table_name='peers' and column_name='linked_user_id') as has_linked_user_id,
  exists (select 1 from information_schema.columns
          where table_name='profiles' and column_name='display_name') as has_display_name,
  exists (select 1 from pg_indexes where indexname='peers_one_row_per_linked_user') as has_index,
  (select prosecdef from pg_proc where proname='get_bill') as security_definer,
  has_function_privilege('anon','get_bill(uuid)','execute') as anon_can_execute,
  has_function_privilege('authenticated','get_bill(uuid)','execute') as auth_can_execute;
"
```

Expected: `t` for every column. `create or replace function` preserves grants, but check rather than assume.

- [ ] Commit: `feat(db): mark organizer self-peer, add display name`

---

## Task 2 — `resolveDisplayName` (TDD)

The name must never be empty: a blank matrix column header is worse than an ugly one.

- [ ] Write `src/lib/bills/displayName.test.ts` **first** and watch it fail:

```ts
import { describe, expect, it } from "vitest";
import { resolveDisplayName } from "./displayName";

describe("resolveDisplayName", () => {
  it("prefers the stored display name", () => {
    expect(
      resolveDisplayName("ต้น", { fullName: "Krittin T", email: "k@example.com" }),
    ).toBe("ต้น");
  });

  it("falls back to the Google full name", () => {
    expect(resolveDisplayName("", { fullName: "Krittin T", email: "k@example.com" })).toBe(
      "Krittin T",
    );
  });

  it("falls back to name when full_name is absent", () => {
    expect(resolveDisplayName(null, { name: "Krittin", email: "k@example.com" })).toBe("Krittin");
  });

  it("falls back to the email local part", () => {
    expect(resolveDisplayName(undefined, { email: "krittin@example.com" })).toBe("krittin");
  });

  it("never returns empty", () => {
    expect(resolveDisplayName("", {})).toBe("ฉัน");
    expect(resolveDisplayName("   ", { fullName: "  ", email: "  " })).toBe("ฉัน");
  });

  it("trims, because the name feeds a unique (organizer_id, name) index", () => {
    expect(resolveDisplayName("  ต้น  ", {})).toBe("ต้น");
  });
});
```

- [ ] Then `src/lib/bills/displayName.ts`:

```ts
/**
 * The organizer's peer-facing name (ADR-0010). Falls back down a chain so a
 * matrix column header is never blank. Trimmed because the result feeds
 * peers.name, which carries a unique (organizer_id, name) index.
 */
export function resolveDisplayName(
  stored: string | null | undefined,
  identity: { fullName?: string | null; name?: string | null; email?: string | null },
): string {
  const candidates = [
    stored,
    identity.fullName,
    identity.name,
    identity.email?.split("@")[0],
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return "ฉัน";
}
```

- [ ] `npx vitest run src/lib/bills/displayName.test.ts` → 6 passing.
- [ ] Commit: `feat(bills): resolve organizer display name`

---

## Task 3 — Display name on `/profile`

- [ ] `src/lib/bills/types.ts`, add to `ProfileRow` (keep it mirroring the migration):

```ts
export interface ProfileRow {
  user_id: string;
  display_name: string;
  promptpay_id: string;
  bank_name: string;
  bank_account: string;
  account_name: string;
}
```

- [ ] `PeerRow` gains the new column, optional so a pre-migration payload still types:

```ts
export interface PeerRow {
  id: string;
  name: string;
  last_used_at?: string;
  /** ADR-0010: set to the organizer's own user id on their self-peer. */
  linked_user_id?: string | null;
}
```

- [ ] `src/app/profile/page.tsx`: add `display_name` to the `select`, and default it through the resolver so the input is never blank on first visit:

```ts
const { data } = await supabase
  .from("profiles")
  .select("user_id, display_name, promptpay_id, bank_name, bank_account, account_name")
  .eq("user_id", user.id)
  .maybeSingle();

const profile: ProfileRow = {
  user_id: user.id,
  display_name: resolveDisplayName(data?.display_name, {
    fullName: user.user_metadata?.full_name,
    name: user.user_metadata?.name,
    email: user.email,
  }),
  promptpay_id: data?.promptpay_id ?? "",
  bank_name: data?.bank_name ?? "",
  bank_account: data?.bank_account ?? "",
  account_name: data?.account_name ?? "",
};
```

- [ ] `src/app/profile/ProfileForm.tsx`: add `"display_name"` to the `Field` union, to both `values` and `stored` initial state, and render it as the **first** field, above ช่องทางรับเงิน. Match the existing label/input markup exactly:

```tsx
<label className="flex flex-col gap-1 text-sm">
  ชื่อที่แสดงในบิล
  <input
    className={inputCls}
    value={values.display_name}
    onChange={(e) => setValues((v) => ({ ...v, display_name: e.target.value }))}
    onBlur={(e) => commit("display_name", e.target.value)}
    placeholder="ชื่อเล่นที่เพื่อนเรียก"
  />
  <span className="text-xs text-ink-muted">ชื่อของคุณในบิล เพื่อนที่เปิดลิงก์จะเห็นชื่อนี้</span>
</label>
```

The page heading is currently ช่องทางรับเงิน, which no longer covers the whole form. Change the `h1` to โปรไฟล์ and leave the existing description with the payment fields.

- [ ] `src/app/profile/actions.ts`: a display-name change must follow through to the self-peer, or the bill keeps showing the old name:

```ts
export async function saveProfile(patch: Partial<Omit<ProfileRow, "user_id">>): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not signed in");
  const { error } = await supabase.from("profiles").upsert({ user_id: user.id, ...patch });
  if (error) throw new Error(`saveProfile: ${error.message}`);

  // ADR-0010: the self-peer's name IS the display name, so keep them in step.
  // A unique (organizer_id, name) collision with a hand-made peer is ignored on
  // purpose: the profile save already succeeded, and failing here would strand
  // the user on a save error they cannot act on.
  const displayName = patch.display_name?.trim();
  if (displayName) {
    await supabase
      .from("peers")
      .update({ name: displayName })
      .eq("organizer_id", user.id)
      .eq("linked_user_id", user.id);
  }
}
```

- [ ] `npm run check` → zero errors.
- [ ] Commit: `feat(profile): display name field`

---

## Task 4 — Auto-add the self-peer on bill creation

`createBill` already reads `profiles`, so the name is one column away.

- [ ] In `src/app/dashboard/actions.ts`, add `display_name` to the profile `select`, then insert the self-peer **after** the bill insert and **before** `redirect` (which throws `NEXT_REDIRECT`, so it must stay outside any try):

```ts
// ADR-0010: the organizer eats on nearly every bill, so they join it by default
// and remove themselves on the rare bill they only paid for. One self-peer per
// organizer, found by linked_user_id and reused across bills.
//
// Wrapped: a bill that exists without the organizer on it is recoverable (add
// yourself from the ล่าสุด chips). A create button that throws is not.
try {
  const displayName = resolveDisplayName(profile?.display_name, {
    fullName: user.user_metadata?.full_name,
    name: user.user_metadata?.name,
    email: user.email,
  });

  const { data: existing } = await supabase
    .from("peers")
    .select("id")
    .eq("organizer_id", user.id)
    .eq("linked_user_id", user.id)
    .maybeSingle();

  let selfPeerId = existing?.id ?? null;

  if (!selfPeerId) {
    const inserted = await supabase
      .from("peers")
      .insert({ organizer_id: user.id, name: displayName, linked_user_id: user.id })
      .select("id")
      .single();
    if (inserted.data) {
      selfPeerId = inserted.data.id;
    } else {
      // The name is already taken by a peer the organizer made by hand. Adopt
      // that row rather than fail: bill creation must not die on a name clash.
      const adopted = await supabase
        .from("peers")
        .update({ linked_user_id: user.id })
        .eq("organizer_id", user.id)
        .eq("name", displayName)
        .select("id")
        .single();
      selfPeerId = adopted.data?.id ?? null;
    }
  }

  if (selfPeerId) {
    await supabase.from("bill_peers").insert({ bill_id: data.id, peer_id: selfPeerId });
  }
} catch {
  // Bill is created either way; the organizer can add themselves manually.
}

redirect(`/bills/${data.id}`);
```

- [ ] Note for the reviewer: this adds up to three round trips to the create path, which #21 is separately about. Accepted for now, collapsible into one RPC when #21 is worked.
- [ ] `npm run check` → zero errors.
- [ ] Commit: `feat(bills): auto-add organizer to new bills`

---

## Task 5 — Badge the self-peer in the editor

Badge only, **no reordering**. The self-peer is added at creation so it is already first by `added_at`, and reordering the chips without reordering the matrix columns (which sort by `added_at`) would put the two out of step.

- [ ] `src/app/bills/[id]/page.tsx`: select the new column and derive the id once:

```ts
supabase
  .from("bill_peers")
  .select("added_at, peers (id, name, linked_user_id)")
  .eq("bill_id", id)
  .order("added_at"),
```

and after `peersOnBill` is built:

```ts
const selfPeerId = peersOnBill.find((peer) => peer.linked_user_id === user.id)?.id ?? null;
```

Pass `selfPeerId={selfPeerId}` to `BillEditor`.

- [ ] `BillEditor.tsx`: accept `selfPeerId: string | null` in `Props` and thread it to `PeerPicker`, `MatrixView` and `CardsView`. No other change.

- [ ] `PeerPicker.tsx`: accept `selfPeerId`, and inside the chip, before the ✕ button:

```tsx
{peer.id === selfPeerId && (
  <span className="rounded-full bg-white/25 px-1.5 text-[11px] font-semibold">คุณ</span>
)}
```

Keep the ✕ working on it: removing yourself is the documented opt-out.

- [ ] `MatrixView.tsx`, the column header at line ~49:

```tsx
<th key={peer.id} className="min-w-14 p-2 text-center font-semibold">
  {peer.name}
  {peer.id === selfPeerId && (
    <span className="block text-[11px] font-normal text-primary-ink">คุณ</span>
  )}
</th>
```

- [ ] `CardsView.tsx`, the totals list at line ~128:

```tsx
<span>
  {peer.name}
  {peer.id === selfPeerId && <span className="ml-1 text-xs text-primary-ink">(คุณ)</span>}
</span>
```

- [ ] `npm run check` → zero errors.
- [ ] Commit: `feat(editor): badge the organizer's own column`

---

## Task 6 — Peer link: visible, not claimable, no payback

- [ ] `src/lib/bills/getBill.ts`, extend the peers payload. Keep the optional-field discipline the `addedAt` comment already establishes:

```ts
  /**
   * Server-ordered by (addedAt, id); re-sort on the same key before rendering.
   * addedAt and isSelf are optional on purpose: fetchBill casts the RPC payload
   * unchecked, so a deploy that lands before the migration would otherwise crash
   * the anon peer view during SSR. Missing addedAt falls back to the id tiebreak;
   * missing isSelf degrades the organizer's row to an ordinary peer.
   */
  peers: {
    id: string;
    name: string;
    paidAt: string | null;
    addedAt?: string;
    isSelf?: boolean;
  }[];
```

- [ ] `src/app/b/[id]/PeerBill.tsx`, after `peersSorted` is built:

```ts
// ADR-0010: the organizer's own row shows its ticks and total so the split
// reconciles against the receipt, but it owes nobody: no claim, no QR, no paid.
const selfPeerId = peersSorted.find((peer) => peer.isSelf)?.id ?? null;
```

- [ ] Harden `validClaimId` so a claim stored before this shipped cannot resolve to the self row:

```ts
const validClaimId =
  claimedId && claimedId !== selfPeerId && peersSorted.some((peer) => peer.id === claimedId)
    ? claimedId
    : null;
```

- [ ] `everyoneSection` (~line 293): when `peer.id === selfPeerId`, render the row as a non-interactive `<div>` carrying the same name and total markup, with a เจ้าของบิล badge in place of the คุณ badge, and **no** paid button and no จ่ายด้านบน echo. Keep the layout classes identical so the row lines up with its neighbours.

- [ ] `matrixView` header (~line 373): same treatment. Render a plain `<span>` instead of the claim `<button>` for the self peer, with the เจ้าของบิล badge below the name. Do not leave a dead button that looks tappable.

- [ ] **Leave the tick chips alone.** Anyone with the link can still tick any cell including the organizer's, which matches the Tick glossary entry and lets a friend tick for you.

- [ ] `npm run check` → zero errors.
- [ ] Commit: `feat(peer): organizer row shows without payback`

---

## Task 7 — Release docs

- [ ] `package.json` → `"version": "0.5.0"`.
- [ ] `CHANGELOG.md`, new section under `[Unreleased]`:

```md
## [0.5.0] — 2026-07-29

The organizer eats too.

### Added

- The organizer joins their own bill automatically and ticks the items they ate (#24). No more creating a peer named after yourself. Remove your own chip on the rare bill you only paid for
- A display name on `/profile`, defaulted from your Google account, that names your row on every bill

### Changed

- On the shared link the organizer's row shows its ticks and total badged เจ้าของบิล, but is not tappable and has no QR or paid toggle: you cannot owe yourself

### Notes

- `peers.linked_user_id` is the column ADR-0005 reserved for peer accounts, so #12's Account Claim inherits it. #11's rollup excludes the organizer from debt and shows their share as context (ADR-0010)
- The migration must be applied **before** the deploy: the new code reads `isSelf` and `display_name`. Both are typed optional so a deploy that wins the race degrades instead of throwing
```

- [ ] `docs/STATUS.md`: mark #24 DONE ✅ v0.5.0 in the roadmap table, move it into the SHIPPED block of the graph, update the phase header, and add the Decision Log row:

| 2026-07-29 | #24: the organizer joins their own bill as a marked self-peer (`peers.linked_user_id`), auto-added on creation, visible but not claimable on the peer link | Every path is keyed on `peer_id`, so a peer row is the only shape; marking it is what lets #11 exclude it from debt and the peer view suppress a QR paying yourself, without the name matching ADR-0005 rejects. Same column #12 needs, so it is paid for once. ADR-0010 | User + main session (grill) |

- [ ] `npm run check` → zero errors.
- [ ] Commit: `docs: v0.5.0 self-peer`

---

## Definition of Done

```bash
npm run check
```

Zero errors, all tests green. Plus:

- [ ] `src/lib/billing/` is untouched by this branch. Confirm with `git diff --stat main -- src/lib/billing/` → empty output.
- [ ] The canonical Katsu fixture still computes A=179.10, B=187.20, C=179.10, D=143.10, E=214.20, checksum 902.70 (covered by the existing suite; the point is that it must not have needed changing).
- [ ] Peer link verified at a 320px viewport, not just desktop.

## Smoke test (for the PR body)

Needs the migration applied plus a deployed preview or `npm run dev`.

- [ ] `/profile` shows ชื่อที่แสดงในบิล pre-filled from Google; edit it, blur, see บันทึกแล้ว ✓
- [ ] Create a bill: your name is already in คนร่วมบิล, badged คุณ
- [ ] Add items, tick your own column, confirm your total appears and the checksum matches the receipt total
- [ ] Change your display name on `/profile`, reload the bill, confirm the chip renamed
- [ ] Remove yourself with the ✕, confirm the bill still computes and you can re-add from the ล่าสุด chips
- [ ] Publish and open the peer link in a private window: your row is visible with its total, badged เจ้าของบิล, not tappable, no QR, no paid toggle
- [ ] Tap a different peer name: their QR still works and shows their exact amount
- [ ] Repeat the peer link at 320px width
- [ ] Create a second bill and confirm you get the **same** peer row, not a duplicate
