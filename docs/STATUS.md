# Split the Bill — Status

**Phase:** 7 — #25 line-total input shipped as v0.4.0 (PR #31, closes duplicate #28): the item row's ราคา and รวม boxes each derive the other live as you type, unit price stays the stored truth, and a typed total back-derives through the engine's exact-BigInt ceil with a visible ปัดขึ้น note. Before it, v0.3.1 (PR #30) fixed the #26 peer-order reshuffle (migration applied to prod and verified). → next: choose between #24 (owner self-select, blocked on a rollup semantics call from the user) and #20 (per-peer calculation breakdown, ready-for-agent, brief already written), then grill #21 (create-flow slowness), then { #11 dashboard, #12 my debts }

**Open from the 2026-07-26 triage:** #20 calculation visibility (ready-for-agent), #24 owner can't self-select (needs the rollup call), #21 create-flow slowness (needs grilling), #27 Microsoft sign-in (needs a go/no-go against the Google-only decision above). See the issues for briefs and open questions.

## Frame (decided 2026-07-14)

- **Scale:** personal — organizer signs in with Google (Supabase Auth); peers use unguessable links, no accounts.
- **Primary actor:** bill payer (organizer): create bill → share link in the team chat (Slack) → collect payback via PromptPay QR.
- **Secondary actor:** peer: open link, tick own items, see own total, mark paid.
- **MVP (v1):** bill editor (menu items, prices, discounts as amount/% + per-item/whole-bill, service charge, VAT), who-ate-what matrix, per-person totals + checksum, shareable link with peer self-ticking, PromptPay QR per peer with exact amount, paid tracking, bill history, cross-bill "who owes me" rollup by peer name.
- **Done for v1:** the team uses it for a real lunch instead of the Google Sheet.
- **Stack:** Next.js (App Router, TypeScript) + Tailwind on Vercel; Supabase (Postgres, Auth, Realtime).

## Roadmap

Spec: [#5](https://github.com/krittintrs/split-the-bill/issues/5). Grilled decisions live in `CONTEXT.md` + `docs/adr/`. Old issues #1–#4 closed as superseded.

```
SHIPPED ✅
 #6 skeleton → #7 billing engine → #8 bill editor → #9 peer link (+paid flag)
   → #15 UI revamp → #10 payback ......................... v0.3.0
   → #26 peer order fix .................................. v0.3.1
   → #25 line-total input (closes dup #28) ............... v0.4.0

READY 🟢  unblocked, brief written, an agent can start now
 #20 calculation visibility ... peer sees how their own total was built
 #11 dashboard ................ history, unpaid rollup, peer rename
 #12 my debts ................. account claim + cross-bill view

BLOCKED 🔴  waiting on a human decision, not on code
 #24 owner self-select ........ does the organizer's own share count in the rollup?
 #21 create-flow slowness ..... needs a grilling session on the persistence model
 #27 Microsoft sign-in ........ go/no-go against the Google-only decision above
```

| Impact | Issue | Description | Blocked by | Who | Status |
|---|---|---|---|---|---|
| High | #6 | Walking skeleton: scaffold, `npm run check`, Vercel deploy, Google sign-in | — | user + agy + main session | DONE ✅ |
| High | #7 | Billing engine: pure satang math, TDD, canonical fixtures | #6 | dev agent | DONE ✅ |
| High | #8 | Organizer bill editor: draft → publish, live totals (prototype layout first) | #6, #7 | dev agent | DONE ✅ |
| High | #9 | Peer link experience: ticking, realtime, lock, basic paid flag | #8 | dev agent | DONE ✅ |
| Med | #15 | UI revamp: impeccable critique → polish on all shipped surfaces | #9 | main session + user | DONE ✅ |
| High | #10 | Payback: payment info, copy paths, QR image, tap-to-claim | #9 | main session + user | DONE ✅ |
| High | #26 | Bug: peer view order reshuffles (no stable ORDER BY on peers) | — | main session | DONE ✅ v0.3.1 |
| Med | #25 | Enhancement: total-amount input mode for line items (supersedes duplicate #28) | — | main session | DONE ✅ v0.4.0 |
| Med | #20 | Enhancement: per-peer calculation breakdown (subtotal/discount/service/VAT) | — | dev agent | READY 🟢 |
| Med | #11 | Dashboard: history, unpaid rollup, peer rename | #10 ✅ | dev agent | READY 🟢 |
| Med | #12 | Account Claim + My Debts | #10 ✅ | dev agent | READY 🟢 |
| High | #24 | Bug: bill owner can't self-select items they ate | rollup semantics call | user | BLOCKED 🔴 |
| Med | #21 | Rework bill creation flow to avoid perceived slowness | grilling session | user | BLOCKED 🔴 |
| Low | #27 | Microsoft sign-in (external request) | go/no-go vs Google-only | user | BLOCKED 🔴 |

## Decision Log

| Date | Decision | Rationale | By |
|---|---|---|---|
| 2026-07-14 | Project bootstrapped with solo-builder-kit | Scale: personal, Stack: Next.js + Supabase + Vercel | User |
| 2026-07-14 | Organizer auth = Google OAuth; peers stay login-free | History + unpaid rollup needs an owner identity; peer friction must stay zero for LINE group adoption | User |
| 2026-07-14 | v1 includes cross-bill unpaid rollup | Daily team lunches; peers forgetting old bills is the top pain the Sheet can't solve | User |
| 2026-07-14 | Money as integer satang in pure `src/lib/billing/` layer | Float-safe math; the sheet's checksum habit becomes an enforced invariant | Main session |
| 2026-07-14 | Issue tracker = GitHub Issues on a public repo | Learning reference; kit's pr-prep already assumes `gh` | User |
| 2026-07-14 | Example CSV anonymized to Person A–E before publishing | Friends' real nicknames stay out of a public, indexed repo | User |
| 2026-07-14 | #6 done: prod live at split-the-bill-sable.vercel.app | Next.js 16.2 (proxy.ts, not middleware.ts), Supabase SG + new publishable-key API, Google OAuth in testing mode (add peers as test users or publish consent screen before team trial) | User + agy |
| 2026-07-15 | #7 billing engine: exact BigInt fractions, results derived never persisted (ADR-0004) | One ceil per Peer Total (ADR-0001); malformed input throws, incomplete-while-editing computes gracefully; tsconfig target ES2020 for BigInt literals | User + dev agent |
| 2026-07-15 | Links shared in Slack, not LINE; desktop is first-class alongside mobile | Team chats in Slack (coworkers, not LINE); constitution amended | User |
| 2026-07-15 | #8 layout locked via /prototype: matrix (items-rows) ≥lg, stacked cards + name chips <lg; no ฿ in chips | 4 variants compared on real screens; verdict on issue #8; prototype preserved on `prototype/8-bill-editor` | User |
| 2026-07-15 | Visual identity: vivid cyan + bright wash, Noto Sans Thai, primary-colored ticks, WCAG AA | Full interview + on-screen palette/font comparison (impeccable init); PRODUCT.md + DESIGN.md written; cyan = owner's color, distinct from Thai bank CIs | User |
| 2026-07-15 | Bill storage: 5 normalized tables + profiles, autosave-per-action (ADR-0005); anon reads via security-definer RPC only (ADR-0006) | Tiny-row writes keep #9 concurrent ticking conflict-free; RLS policies can't check capability, so the RPC is the only anon door | User |
| 2026-07-16 | Keep vivid fills at 3.1:1 white-on-primary — documented AA deviation (DESIGN.md Known deviations) | Reviewer measured the failure; AA-passing darker ramp compared on screen and rejected as losing the light & playful identity; rest of the palette stays AA | User |
| 2026-07-16 | #8 shipped (PR #14) = v0.1.0: calculate + share; paid tracking stays in #10 | Editor reordered to receipt-entry flow after smoke test; `payment_method` column + rebuilt `get_bill` migration applied | User + main session |
| 2026-07-17 | #9: locked = ticks frozen only, paid stays live; realtime = broadcast ping + refetch (ADR-0007) | postgres_changes dead for anon under ADR-0006; lock/pay ordering | User + main session |
| 2026-07-25 | #10 payback: generate PromptPay QR client-side per peer (not upload), typed payment fields, in-house EMV builder | ADR-0008 (upload leaks name/branding, can't carry per-peer amount; client-side adds no attack surface), ADR-0009 (free-form can't drive QR; frozen standard = no dep needed); attribution deferred to #12 | User + main session (grill) |
| 2026-07-25 | #10 peer UI = design "C+" (locked via /impeccable): no separate claim strip — the "ทุกคน" list is the selector; tap your name (device-local localStorage claim, no login) → payback panel pins to top + auto-scroll. #9 never shipped soft-claim, so #10 absorbs a minimal claim. Profile page gets a static QR preview | Copy buttons (required path) read cleaner in a top panel than crammed in a row; reuses existing list; on-brand "one loud thing"; mock confirmed on phone | User + main session (impeccable craft) |
| 2026-07-19 | #15: UI speaks lifecycle phases, not mechanisms — locked shows as "💰 พร้อมเก็บเงิน", lock buttons name the mechanism (ล็อกรายการ) | "Locked"/ปิดยอด confuse (freeze vs settled); phase language scales to #10 QR and a derived "ครบแล้ว" state; glossary in CONTEXT.md | User + main session |
| 2026-07-27 | #25: a Line Item's unit price stays the stored truth; the editor's total box is a second view (gross, before item discount) that back-derives it, ceil'd per ADR-0001 | Storing the typed total instead would mean a migration, a compute.ts change and two sources of truth for one price; ceil keeps the organizer whole and the box re-derives to the settled figure so the round-up is never silent. Glossary clause in CONTEXT.md | User + main session |
| 2026-07-29 | #26: peers are ordered by `(added_at, id)` in the anon RPC and re-sorted client-side on the same key, compared byte-wise rather than with `localeCompare`; payload fields the client sorts on are typed optional | `jsonb_agg` has no order without `ORDER BY`, so refetches reshuffled columns. ICU orders "." before "+", so `localeCompare` on ISO timestamps disagrees across browser locales; byte order matches Postgres. **Migrations here cut both ways** — #10's dropped columns so it had to run *after* deploy, #26's must run *before* — and Vercel deploys on merge while migrations are manual, so client code must degrade rather than throw when a field is missing | User + main session (reviewer) |
