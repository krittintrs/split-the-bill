# Split the Bill — Backlog

> Not active development. Promote an item to `STATUS.md`'s roadmap when you pick it up, then delete it here.

## Ideas

### Peer experience
- LINE integration (LIFF mini-app / share message template) so links open natively in the group chat
- Payment slip upload so peers attach proof when marking paid
- Peer nudge: one-tap "remind unpaid peers" message text to paste into LINE
- Soft Claim: peer taps own name → row pins on top, total big, persists per device via localStorage (cut from #9, 2026-07-16: cosmetic only, 5-8 name list scannable; zero structural cost to add later)
- Two-phase paid confirm: peer marks paid → organizer confirms → peer can no longer untoggle (decided against for #9, 2026-07-16: bank notification is the real confirmation, friend-group trust; promote only if team trial shows false-paid problem)

### Organizer experience
- Receipt OCR: photo of the bill → menu items + prices pre-filled
- Lunch group templates: recurring peer roster (same team eats daily) pre-fills names
- Export bill / history to CSV (parity with the old Sheet)

### Polish
- Dark mode — v1 ships light-only (DESIGN.md); needs a full dark ramp of the cyan tokens
- Per-peer pipeline breakdown rows under the desktop matrix (subtotal → discount → SC → VAT → total, like the old Sheet) — needs the engine to expose intermediate values (ADR-0004 says derive, so new grill required)
- Initial-only peer chips when a bill has >8 peers (name chips wrap fine below that)
- Peer page ทุกคน list: a *claimed* peer owing ฿0 renders no status echo (`PeerBill.tsx`, the `paid || peerTotal > 0` guard), so that row loses its second flex child and its total sits ~80px right of every other total, with no `min-h-10` height floor. Pre-existing; found reviewing #24, which fixed the identical defect on the self row nine lines above using an `invisible` clone of the pay button
- Sheet-style inline item editing inside the matrix rows (v1 edits items in their own card above)
- Billing engine restricts discount/SC/VAT percents to integers (all 61 real bills used 0/5/7/10) — loosen to fractional % only if a real receipt demands it
- Landing page should display auth errors (currently `/?error=oauth` and `/?error=auth` params are silently ignored)
- Publish Google OAuth consent screen (or add peers as test users) before team trial — testing mode blocks unknown logins

### Later / maybe
- Peer accounts (claim your name across organizers, see your own debts)
- Multi-currency
- Settle-up optimization across mutual debts within the group

## Removed / Done

- (nothing yet)
