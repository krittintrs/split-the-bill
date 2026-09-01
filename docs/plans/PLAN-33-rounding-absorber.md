# Rounding Absorber Implementation Plan (v2 — single tier)

**Issue:** [#33](https://github.com/krittintrs/split-the-bill/issues/33)
**Goal:** checksum ties the receipt exactly whenever every item is ticked, by ceiling every peer independently (unchanged, ADR-0001) and subtracting the always-non-negative bill-wide leftover from one named peer, default the organizer.
**Architecture:** see [ADR-0011](../adr/0011-rounding-absorber-peer.md) — this supersedes the two-tier design from the same ADR's first draft (already shipped once, being reverted here). One column (`bills.rounding_absorber_peer_id`), one UI control, no per-item picker.

## Already done and verified in this session — do not redo, do not re-derive numbers

`src/lib/billing/compute.ts`, `src/lib/billing/types.ts`, `src/lib/billing/fraction.ts`,
`src/lib/billing/fraction.test.ts`, and `src/lib/billing/compute.test.ts` are already rewritten
for the single-tier design and verified: **57/57 tests pass**, confirmed by actually running
`npx vitest run src/lib/billing`. The canonical Katsu fixture is confirmed byte-identical
(`billLeftover` is `undefined` for it — every peer's exact share there is already an integer).
`floorToSatang` was removed entirely from `fraction.ts`/`fraction.test.ts` — it's dead code now
that there's no floor-based tier. `docs/adr/0011-rounding-absorber-peer.md` and the pointer in
`docs/adr/0001-integer-satang-round-up.md` are already rewritten too.

**Do not touch any of those 6 files unless `npm run check` tells you to.** The remaining work is
entirely the DB migration and the app/UI layer below.

## Remaining file map

| File | Change |
|---|---|
| `supabase/migrations/20260901000000_drop_item_rounding_absorber.sql` | New migration (not an edit — the old one is already applied to the linked project). Drops `line_items.rounding_absorber_peer_id`; keeps `bills.rounding_absorber_peer_id`. Reissue `get_bill()` to drop the per-item field from its `items` JSON. |
| `src/lib/bills/types.ts` | Remove `rounding_absorber_peer_id` from `LineItemRow`. Keep it on `BillRow`. |
| `src/lib/bills/mutations.ts` | Remove `"rounding_absorber_peer_id"` from `LineItemPatch`'s `Pick<...>` union. Keep it on `BillPatch`. |
| `src/lib/bills/getBill.ts` | Remove `roundingAbsorberPeerId` from the `items` entry of `GetBillJson`. Keep it on `bill`. |
| `src/lib/bills/mapper.ts` | Remove `roundingAbsorberPeerId: item.rounding_absorber_peer_id ?? undefined` from the per-item mapping. Keep the bill-level line unchanged. |
| `src/lib/bills/mapper.test.ts` | Drop any assertions on the removed per-item field; keep the bill-level ones. |
| `src/components/RoundingLeftoverBadge.tsx` | No structural change — still leftover badge → chevron → expandable picker with a labeled shuffle option. Flip the copy: it now reads as a subtraction/discount (`−฿0.02 → Tinn`), not an addition. Update any internal wording that said "absorbs" to something like "keeps the discount" / "ปัดเศษให้". |
| `src/app/bills/[id]/MatrixView.tsx` | Remove the item-level badge entirely (the `leftover = result.itemLeftovers[item.id]` line and the `{leftover && <RoundingLeftoverBadge .../>}` block in the item name cell — `itemLeftovers` no longer exists on `BillResult`, this is what's currently causing the 2 typecheck errors). Remove the `onUpdateItemAbsorber` prop entirely. Add the ONE remaining badge to the `รวมต่อคน` footer row's sticky cell instead — same pattern the item badge used to have, `candidateIds` = every peer on the bill (not just one item's tickers), `onChange` wired to a new `onUpdateBillAbsorber` prop threaded down from `BillEditor`. |
| `src/app/bills/[id]/CardsView.tsx` | Same shape of change as MatrixView: remove the item-level badge from each item card, remove `onUpdateItemAbsorber`, add the one relocated badge to the totals area at the bottom of the card list (mirrors MatrixView's footer row placement). |
| `src/app/bills/[id]/BillEditor.tsx` | Remove `onUpdateItemAbsorber` and its call site inside the เช็คกับใบเสร็จ section (the `{result.billLeftover && <RoundingLeftoverBadge .../>}` block currently there moves out — เช็คกับใบเสร็จ no longer shows a picker at all). Keep `onUpdateBillAbsorber` (unchanged — still `saveBill({ rounding_absorber_peer_id: peerId })`), thread it into `MatrixView`/`CardsView` as a new prop instead. Remove the `onUpdateItemAbsorber` prop passed to both views. |
| `src/app/b/[id]/PeerBill.tsx` | Remove `roundingAbsorberPeerId` from the per-item mapping in the `billInput` memo (peers never had a picker; this was only feeding the item tier's default resolution, which no longer exists). Keep the bill-level field. |
| `docs/STATUS.md` | Update the #33 entry to describe the v2 single-tier design (it currently describes the reverted two-tier one from the same session) — replace, don't append a second entry. |

## Reference: the mock this should match

This session's artifact (same URL as the earlier two-tier mock, updated in place) shows the target
UI: item rows/cards carry only a plain muted `÷n = ฿x each` line, no picker, ever. The one control
lives in the `รวมต่อคน` row/total bar, labeled as a subtraction (`−฿0.02 → Tinn`) in the same
warning-amber pill, expanding into the same picker-plus-shuffle pattern as before, just scoped to
every bill peer instead of one item's tickers.

## Verification

`npm run check` must be zero errors when done (currently 2 typecheck errors, both `itemLeftovers`
references in MatrixView/CardsView that this plan removes). Re-run `npx vitest run src/lib/billing`
specifically at the end too — it's already green, confirm it stays that way.

Peer-facing (`/b/[id]`) must show no picker anywhere, same as before — verify at a 375px viewport.

Manually verify (post-implementation testing is acceptable for UI per CLAUDE.md): a 3-peer bill
splitting one item that doesn't divide evenly shows nothing on the item row, and exactly one
`−฿x → name` badge on the totals row; changing it via the picker updates the totals live; a hard
reload keeps the change (confirms `saveBill` actually persisted `rounding_absorber_peer_id`, not
just updated local state).

## Definition of Done

1. `npm run check` — zero errors.
2. Billing engine change: already done, 57/57 green, canonical Katsu fixture unaffected.
3. Peer-facing flow verified on mobile viewport: correct tied totals, zero picker UI.
