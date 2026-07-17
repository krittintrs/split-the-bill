# Changelog

All notable changes to Split the Bill are documented here.
Versions follow [semver](https://semver.org); v1.0.0 = the team uses it for a real lunch.

## [Unreleased]

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
