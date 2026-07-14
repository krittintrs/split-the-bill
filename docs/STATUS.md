# Split the Bill — Status

**Phase:** 0 — Bootstrapped, pre-scaffold

## Frame (decided 2026-07-14)

- **Scale:** personal — organizer signs in with Google (Supabase Auth); peers use unguessable links, no accounts.
- **Primary actor:** bill payer (organizer): create bill → share link in LINE → collect payback via PromptPay QR.
- **Secondary actor:** peer: open link, tick own items, see own total, mark paid.
- **MVP (v1):** bill editor (menu items, prices, discounts as amount/% + per-item/whole-bill, service charge, VAT), who-ate-what matrix, per-person totals + checksum, shareable link with peer self-ticking, PromptPay QR per peer with exact amount, paid tracking, bill history, cross-bill "who owes me" rollup by peer name.
- **Done for v1:** the team uses it for a real lunch instead of the Google Sheet.
- **Stack:** Next.js (App Router, TypeScript) + Tailwind on Vercel; Supabase (Postgres, Auth, Realtime).

## Roadmap

```
READY 🟢
 1. Claim URL: create Vercel project + Supabase project, deploy hello-world
 2. Model hardest problem on mocks: billing engine (pure functions + TDD
    against the canonical CSV fixture) + bill editor UI on mock data
 3. Wire real DB: schema + RLS, Google OAuth, shareable links, Realtime ticks
 4. Iterate features: PromptPay QR, paid tracking, history, unpaid rollup
```

| Impact | Issue | Description | Blocked by | Who | Status |
|---|---|---|---|---|---|
| High | #1 | Claim URL (Vercel + Supabase hello-world deploy) | — | user + main session | READY |
| High | #2 | Billing engine on mocks (TDD) + bill editor UI | — | dev agent | READY |
| High | #3 | DB schema, RLS, Google OAuth, share links, Realtime | #1, #2 | dev agent | READY |
| High | #4 | PromptPay QR, paid tracking, history, unpaid rollup | #3 | dev agent | READY |

## Decision Log

| Date | Decision | Rationale | By |
|---|---|---|---|
| 2026-07-14 | Project bootstrapped with solo-builder-kit | Scale: personal, Stack: Next.js + Supabase + Vercel | User |
| 2026-07-14 | Organizer auth = Google OAuth; peers stay login-free | History + unpaid rollup needs an owner identity; peer friction must stay zero for LINE group adoption | User |
| 2026-07-14 | v1 includes cross-bill unpaid rollup | Daily team lunches; peers forgetting old bills is the top pain the Sheet can't solve | User |
| 2026-07-14 | Money as integer satang in pure `src/lib/billing/` layer | Float-safe math; the sheet's checksum habit becomes an enforced invariant | Main session |
| 2026-07-14 | Issue tracker = GitHub Issues on a public repo | Learning reference; kit's pr-prep already assumes `gh` | User |
| 2026-07-14 | Example CSV anonymized to Person A–E before publishing | Friends' real nicknames stay out of a public, indexed repo | User |
