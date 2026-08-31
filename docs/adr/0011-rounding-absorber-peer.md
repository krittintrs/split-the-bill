# Rounding absorbers: per item first, one bill-level backstop

Refines ADR-0001. Verified by hand-running the real engine against every scenario below
(`src/lib/billing/compute.ts` + `fraction.ts`, scratch-implemented and reverted — see #33 plan
for the exact diff) before writing this down, not derived on paper.

## The two tiers

**Item tier.** Each ticked item's exact post-discount cost is ceil'd ONCE to satang — the same
ADR-0001 "never underpay the organizer" ceiling, now scoped to the item instead of a peer's
whole-bill aggregate. That ceil'd amount is then handed out by flooring every ticker's share and
giving the item's own leftover (0..tickerCount−1 satang) to that item's designated absorbing
ticker: default the first ticker in `tickedBy` order, organizer-overridable per item, falling
back to the first ticker if the stored id is stale or not one of that item's tickers. A 1-ticker
item degenerates to exactly the old per-item ceiling (the only ticker IS the absorber, remainder
= ceil − floor) — proven by running the existing `"carries fractional satang exactly..."` fixture
through the new code unchanged.

This is what #33's actual complaint needed: item 1 (₴100 ÷ A,B,C) and item 2 (₴25 ÷ D,E,F) each
resolve their own leftover inside their own ticker group — verified: A ends up +1 over B/C, D
ends up +1 over E/F, with zero cross-contamination between the two groups.

**Bill tier.** Item-level ceiling can still make the *sum* of peers' now-integer subtotals land
above the bill's true exact subtotal (each fractional multi-ticker item can add up to 1 satang of
ceiling "overshoot"), and SC/VAT compounding on top of that integer subtotal can add its own
per-peer rounding noise. Both are bill-wide, not tied to any item's ticker group, so — unlike the
item tier — one designated peer absorbing the *whole* gap is the right scope here, not a
per-group split. Mechanism: floor every peer's final (subtotal→SC→VAT) total, then add
`receiptTotalSatang − Σ floors` (can be negative — see below) to one bill-level absorber,
default the organizer's self-peer, resolved by the caller and falling back to the first peer.
Verified this tier engages even with SC = VAT = 0%, purely from item-ceiling overshoot across
multiple items (the cross-item example above needed no bill-tier correction only because neither
item's cost was inflated by a discount; a bill with several multi-ticker items generally will).

Both tiers reuse the identical UI component — a leftover badge that expands into a picker with a
shuffle option — the only difference is scope: an item's picker offers just that item's tickers,
the bill's picker offers every peer. Both hide entirely when their own leftover is zero.

## A negative remainder is not a bug

The bill-tier remainder can be negative (item-ceiling overshoot made the aggregate exceed the
receipt) — verified: two single-ticker items (₴10.00 and ₴20.00, one ticker each, bill discount
producing a 2/3 ratio) each ceil to their own ticker independently (₴6.67, ₴13.34), summing to
₴20.01 against a ₴20.00 receipt; the bill-tier absorber's total comes out *below* their own
item-ceil'd share (₴6.66, not ₴6.67) to close the gap. The checksum still ties exactly — the
identity `absorber_total = floor(absorber) + (receipt − Σ floors)` holds regardless of the
remainder's sign. The only real risk is a peer whose own floor is smaller than the magnitude of a
negative remainder, which would drive their total below zero; `compute.ts` must guard this (fall
back to the peer with the largest floor total if the designated absorber can't safely absorb it)
rather than ever return a negative peer total.

## Considered options

- **Largest-remainder across all peers** (ADR-0001 already rejected this) — ties exactly, but two
  peers who ticked identical items can land on different totals with no visible reason.
- **One bill-level absorber for everything** (this ADR's own first draft) — mathematically ties,
  but conflates unrelated items' rounding onto one person who may not have touched some of the
  items generating it; rejected after walking through a concrete two-group counter-example.
- **Per-item only, no bill tier** — insufficient: item-ceiling overshoot and SC/VAT-stage noise
  are bill-wide, with no natural item to scope them to; a checksum mismatch would remain on any
  bill with several multi-ticker items or a nonzero SC/VAT.
- **Two-tier hybrid (chosen)** — each mechanism scoped to where its randomness actually
  originates: per-item where ticker groups differ, one bill-wide backstop where they don't.

Bounded impact either way: item-tier remainders are `< tickerCount` satang per item; the bill-tier
remainder is bounded by roughly the number of items with a fractional multi-ticker split. Neither
tier ever reallocates real money, only rounding noise.
