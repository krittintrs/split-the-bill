# Money is integer satang; peer totals round up

All money is stored and computed as integer satang; conversion to ฿ happens only at display. Each Peer Total rounds UP to the next satang after the charge pipeline, so the Checksum may exceed the Receipt Total by a few satang (organizer keeps the surplus, no payer ever underpays).

**Considered options:** float baht (what the Google Sheet did — produced values like 207.3333 and silent drift), largest-remainder exact allocation (checksum exactly equals receipt, but two peers sharing identically can owe different amounts, which reads as a bug). Round-up was chosen for explainability over exactness.

**Refined by [ADR-0011](0011-rounding-absorber-peer.md) (#33):** round-up-per-peer still applies to every peer, unchanged, always — that's the part of this ADR that never changed. When every item is ticked, the bill-wide leftover (sum of those independent ceilings minus the receipt total, always ≥ 0 — ceiling is superadditive) is *subtracted* from one named peer instead of silently staying with the organizer as an invisible windfall, default the organizer's self-peer. The checksum ties the receipt exactly, without the largest-remainder problem this ADR rejected — the one peer who differs is always a deliberate, attributable choice (visible in the UI), not an algorithm artifact.
