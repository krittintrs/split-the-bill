# Changelog

All notable changes to Split the Bill are documented here.
Versions follow [semver](https://semver.org); v1.0.0 = the team uses it for a real lunch.

## [Unreleased]

## [0.2.1] — 2026-07-19

Polish pass: the app stops feeling like an engineer built it. Critique-driven fixes (#15) on top of the mobile-agent UX round (#19).

### Added

- Hard bill delete (#19): organizer can delete a draft or open bill (confirm dialog, blocked once locked) from the dashboard or the editor
- Route loading skeletons for dashboard, editor, and peer page (#15)
- "บันทึกแล้ว ✓" autosave confirmation in the editor header (#15)
- Owner-only "แก้ไขบิล" button on the peer page linking back to the editor (#15)
- Editor → peer-view nav link next to the copy-link button (#19)

### Changed

- Dashboard bill cards show a spinner and dim while navigating instead of feeling unresponsive (#19)
- Dashboard row actions moved into a ⋯ menu inside the bill card; locked bills show a disabled delete entry instead of a silently missing one (#15)
- Status copy speaks in lifecycle phases: locked bills badge as "💰 พร้อมเก็บเงิน" everywhere (was a draft-lookalike), lock buttons say ล็อกรายการ/ปลดล็อกรายการ, peer banner reads "สรุปยอดแล้ว บิลพร้อมเก็บเงิน กด จ่ายแล้ว ได้เลย" (#15)
- Editor copy-link and open-peer-view merged into one primary split-button [คัดลอกลิงก์ | ↗] (#15)
- Peer page tick and paid cells get a visible idle affordance (bordered square with faint ✓) instead of blank squares (#15)
- Editor header: copy-link promoted to the primary button, delete tucked into the ⋯ menu, status pill moved to the top row (#15)
- Receipt check: "Checksum" label replaced with Thai "ยอดรวม", not-yet-entered state shown neutral instead of red, duplicate status line removed (#15)
- Delete-confirm dialog properly centered (#15)
- Autosave failures in the bill editor show an inline retry banner instead of an `alert()` + full page reload (#19)
- Consistent hover/press feedback (darker fill on hover, `active:scale-95` on press) across all buttons app-wide (#19); hover fills now fade instead of snapping (#15)

## [0.2.0] — 2026-07-17

Better than the Sheet: peers do their own ticking, live.

### Added

- Peer ticking without login (#9): anyone with the `/b/[id]` link can tick their own items and see changes from other devices within ~2s
- Paid flags: peers mark themselves paid, live for everyone watching the bill
- Bill lock: organizer freezes ticks while keeping paid toggles live; chip list and matrix layouts flip section order when locked

### Fixed

- Dashboard add-bill button disabled while creating, preventing duplicate bills from rapid double-clicks (#16, PR #17)

## [0.1.0] — 2026-07-16

First usable release: calculate + share. The organizer does everything; peers view.

### Added

- Organizer bill editor (#8): create draft bill, add menu items with qty and per-item discounts, bill-level discount / service charge / VAT, autosave per action
- Who-ate-what ticking: matrix view on desktop, stacked cards on mobile
- Live per-person totals from the #7 billing engine (integer satang, checksum verified against the receipt total)
- Receipt check section: compare system-calculated total against the printed receipt
- Publish flow: draft → open activates the capability link
- Peer view `/b/[id]` (#8, read-only until #9): items, per-person totals, payment info — no login
- Payment method field (bank name / พร้อมเพย์) next to the account number
- Google sign-in for the organizer, dashboard with bill list (#6)
- Billing engine (#7): pure satang math with exact BigInt fraction splits, canonical Katsu-bill fixture
