# One peer keeps the bill-wide rounding discount

Supersedes this ADR's own first draft (item tier + bill tier). Verified against the real engine
by implementing it, running the full suite, and re-deriving every number that changed — not
hand-derived. See `docs/plans/PLAN-33-rounding-absorber.md` for the exact diff.

## The mechanism

Every peer's total still rounds UP independently, exactly as ADR-0001 always did — nobody but the
designated peer is ever touched, and two peers who ticked identical items still land on identical
totals (the property ADR-0001 was written to protect). Once every item is ticked, the bill-wide
leftover — `Σ(each peer's independent ceiling) − receiptTotalSatang` — is **subtracted** from one
named peer instead of silently staying with the organizer as an invisible windfall, default the
organizer's self-peer (resolved by the caller), organizer-overridable, falling back to `peerIds[0]`
if unset or stale.

Worked example: ฿100.00 ÷ 3 → 33.3333 each → everyone ceils to ฿33.34 independently → checksum
฿100.02 against a ฿100.00 receipt → leftover ฿0.02 comes off the designated peer: ฿33.34 − ฿0.02 =
**฿33.32**. Everyone else keeps their full ceil'd ฿33.34, which is why the organizer benefits
(pays less than the exact ฿33.3333 fair share) while every other peer still never underpays them
(ceil'd, ADR-0001's original guarantee, unbroken).

**Proof the leftover is never negative** — the property v1 didn't have: ceiling is superadditive,
`ceil(a) + ceil(b) ≥ ceil(a+b)` for any real numbers, generalizing to any number of terms. Every
peer's ceiling here comes from the same exact fractions that sum exactly to the bill's exact total
(no intermediate per-item rounding introduces any distortion), so `Σ ceil(peer_i) ≥ ceil(Σ peer_i)
= receiptTotalSatang` always. The only remaining guard: the designated peer's own ceil'd total
might be smaller than the leftover (e.g. they ticked nothing, ceil = 0) — in that case fall back to
whichever peer has the largest ceil'd total, so no peer's total is ever driven below ฿0.

**Known display limitation, unchanged from v1**: the peer who absorbs the discount can show a
negative `vatSatang` residual in the subtotal/SC/VAT breakdown (`total − subtotal − SC` goes
negative when the subtraction is large relative to their own SC-stage residual), even though
`peerTotals` itself is always correct and never negative. Clamp at the display edge
(`Math.max(0, vatSatang)`), not in `compute.ts` — same clamp already shipped for v1, unaffected by
this change since it only ever reads the sign of the final value.

## Why this replaced the two-tier design

v1 (item tier: each item's own leftover to a ticker of that item; bill tier: the remaining
bill-wide gap to one peer) existed to solve a real objection: a single global absorber felt
arbitrary when an item's leftover landed on someone who never touched that item. That objection
only holds if the *goal* is attributing rounding noise back to its source.

The goal changed: this isn't about tracing noise, it's "peers always round up in the organizer's
favor — protecting the organizer from ever being shorted by any individual peer — and the
organizer keeps a small, visible amount of that as a deliberate perk for fronting the bill and
doing the split," the same way the organizer silently kept it before #33 ever existed, just made
explicit and visible instead of silent. Once the justification is "the organizer's fee," it no
longer matters which item the money came from — there's nothing left to attribute. That dissolves
v1's reason to exist, and with it: no per-item picker, no `LineItemInput.roundingAbsorberPeerId`,
no `line_items.rounding_absorber_peer_id` column, no "why are there two dropdowns" confusion, and
no possibility of a negative bill-tier remainder (v1's item-tier ceiling-then-floor-then-add
compounding was what could push the aggregate below the receipt; v2 has no per-item tier to
compound against).

## Considered options

- **Largest-remainder across all peers** (ADR-0001's original rejection, still holds) — ties
  exactly, but two peers who ticked identical items can land on different totals for no visible
  reason.
- **Two-tier, item + bill** (this ADR's own v1) — solves item-group attribution, but needs two
  UI controls, a per-item DB column and migration, and can produce a negative bill-tier remainder
  from item-tier ceiling compounding. Reverted; see PLAN-33 for the revert diff.
- **Single bill-wide discount, subtract from one named peer (chosen)** — one control, one column,
  provably non-negative leftover, and the "why does this feel arbitrary" objection dissolves once
  the framing is "organizer's fee" rather than "rounding attribution."
