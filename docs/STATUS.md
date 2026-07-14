# Split the Bill — Status

**Phase:** 1 — Spec'd and ticketed, pre-scaffold

## Frame (decided 2026-07-14)

- **Scale:** personal — organizer signs in with Google (Supabase Auth); peers use unguessable links, no accounts.
- **Primary actor:** bill payer (organizer): create bill → share link in LINE → collect payback via PromptPay QR.
- **Secondary actor:** peer: open link, tick own items, see own total, mark paid.
- **MVP (v1):** bill editor (menu items, prices, discounts as amount/% + per-item/whole-bill, service charge, VAT), who-ate-what matrix, per-person totals + checksum, shareable link with peer self-ticking, PromptPay QR per peer with exact amount, paid tracking, bill history, cross-bill "who owes me" rollup by peer name.
- **Done for v1:** the team uses it for a real lunch instead of the Google Sheet.
- **Stack:** Next.js (App Router, TypeScript) + Tailwind on Vercel; Supabase (Postgres, Auth, Realtime).

## Roadmap

Spec: [#5](https://github.com/krittintrs/split-the-bill/issues/5). Grilled decisions live in `CONTEXT.md` + `docs/adr/`. Old issues #1–#4 closed as superseded.

```
READY 🟢
 #6 walking skeleton  →  #7 billing engine  →  #8 bill editor
   →  #9 peer link  →  #10 payback  →  { #11 dashboard, #12 my debts }
```

| Impact | Issue | Description | Blocked by | Who | Status |
|---|---|---|---|---|---|
| High | #6 | Walking skeleton: scaffold, `npm run check`, Vercel deploy, Google sign-in | — | user + main session (hands-on) | READY |
| High | #7 | Billing engine: pure satang math, TDD, canonical fixtures | #6 | dev agent | READY |
| High | #8 | Organizer bill editor: draft → publish, live totals (prototype layout first) | #6, #7 | dev agent | READY |
| High | #9 | Peer link experience: soft claim, ticking, realtime, lock | #8 | dev agent | READY |
| High | #10 | Payback: payment info, copy paths, QR image, paid flags | #9 | dev agent | READY |
| Med | #11 | Dashboard: history, unpaid rollup, peer rename | #10 | dev agent | READY |
| Med | #12 | Account Claim + My Debts | #10 | dev agent | READY |

## Decision Log

| Date | Decision | Rationale | By |
|---|---|---|---|
| 2026-07-14 | Project bootstrapped with solo-builder-kit | Scale: personal, Stack: Next.js + Supabase + Vercel | User |
| 2026-07-14 | Organizer auth = Google OAuth; peers stay login-free | History + unpaid rollup needs an owner identity; peer friction must stay zero for LINE group adoption | User |
| 2026-07-14 | v1 includes cross-bill unpaid rollup | Daily team lunches; peers forgetting old bills is the top pain the Sheet can't solve | User |
| 2026-07-14 | Money as integer satang in pure `src/lib/billing/` layer | Float-safe math; the sheet's checksum habit becomes an enforced invariant | Main session |
| 2026-07-14 | Issue tracker = GitHub Issues on a public repo | Learning reference; kit's pr-prep already assumes `gh` | User |
| 2026-07-14 | Example CSV anonymized to Person A–E before publishing | Friends' real nicknames stay out of a public, indexed repo | User |
