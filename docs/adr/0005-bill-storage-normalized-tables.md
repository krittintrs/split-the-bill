# Bills are stored as normalized rows; peers are the organizer's contacts, not users

A bill is five tables: `bills` (document + bill-level rates + status), `line_items`, `peers` (organizer-scoped saved contacts with `last_used_at` for recent-first chips), `bill_peers` (who is on this bill, even with zero ticks yet), and `ticks` (one row per item×peer, PK enforces no double-tick). No computed money is ever stored (ADR-0004); clients map rows to `BillInput` and derive totals via `computeBill`.

Peers are **contacts in the organizer's address book**, not accounts: they hang off `organizer_id`, and the same peer row is reused across bills so the cross-bill unpaid rollup (#11/#12) can aggregate by identity instead of by fragile name strings. If peers ever get accounts post-MVP, `peers` gains a nullable `linked_user_id`; history never migrates.

Editing is **autosave-per-action** (insert item row, toggle tick row, update bill field on blur — no Save button). This is the constitution's "Supabase is the single source of truth, no client shadow state" applied literally; a half-typed bill survives closing the phone at the lunch table. Publish is a single `status: draft → open` update.

**Considered options:** one JSONB payload column (fewer tables, but #9's concurrent peer ticking would rewrite the whole blob and conflict, and Realtime granularity becomes all-or-nothing); peers as `auth.users` rows (breaks the constitution's no-login-for-peers rule — friends would have to sign in to be tickable); per-bill free-text peer names (no cross-bill identity, rollup becomes garbage: "Ben", "ben " and "เบน" would be three people); explicit Save button (violates single-source-of-truth, loses in-progress bills).
