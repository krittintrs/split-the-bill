# Changelog

All notable changes to Split the Bill are documented here.
Versions follow [semver](https://semver.org); v1.0.0 = the team uses it for a real lunch.

## [Unreleased]

## [0.6.0] — 2026-08-31

The math shows its work.

### Added

- เช็คกับใบเสร็จ now shows a line-by-line breakdown (subtotal → +Service charge → +VAT → total) instead of one final figure, so a surprising total is never a mystery (#20, #34)
- Both matrix tables (organizer's editor and the peer's desktop view) gained Service charge and VAT footer rows, plus a discount row that only appears when a discount is actually set
- On a peer's phone, claiming your name now shows your own subtotal → discount → SC → VAT breakdown right on your row, reconciling exactly to the amount above the QR
- Service charge, VAT, and discount percent fields always show a "%" so a typed value can't be misread as something else; Service charge gets 5%/10% quick-fill chips and VAT gets a 7% chip (Thailand's rate)

### Fixed

- #34 ("the total didn't come out to what I typed"): not a code bug — Service charge and VAT had been entered as 100% each instead of 5%/7%, with no visible unit hint making the mistake easy to miss. Fixed by the visibility work above, not by changing any math
- A duplicate, float-based discount calculation that had crept into two components (caught in review before merge) is gone; discount amounts are computed once, exactly, in `computeBill()`

### Notes

- `computeBill()` internally decomposes its pipeline into staged subtotal → +SC → +VAT (+ discount as the gross-minus-net gap), exposed as new `BillResult` fields (`subtotalSatang`, `serviceChargeSatang`, `vatSatang`, `discountSatang`, `peerBreakdowns`). Same exact BigInt fractions as before; `peerTotals`/`checksumSatang` are unchanged (canonical Katsu fixture still green). VAT is always the residual line so the displayed numbers sum exactly to the total, never independently rounded

## [0.5.0] — 2026-07-30

The organizer eats too.

### Added

- The organizer joins their own bill automatically and ticks the items they ate (#24). No more creating a peer named after yourself. Remove your own chip on the rare bill you only paid for
- A display name on `/profile`, defaulted from your Google account, that names your row on every bill

### Changed

- On the shared link the organizer's row shows its ticks and total badged เจ้าของบิล, but is not tappable and has no QR or paid toggle: you cannot owe yourself

### Notes

- `peers.linked_user_id` is the column ADR-0005 reserved for peer accounts, so #12's Account Claim inherits it. #11's rollup excludes the organizer from debt and shows their share as context (ADR-0010)
- Apply the migration **before** the deploy. Every call site that reads a new column uses `select("*")` rather than naming it, because PostgREST fails the whole query on an unknown column, so a deploy that wins the race leaves the organizer off new bills instead of blanking payment info and emptying peer lists
- The organizer's `linked_user_id` is never written onto a peer row they did not create. If the display name collides with a peer you already had, you join as `ชื่อ (เจ้าของบิล)`; delete the old row and rename to clear it

## [0.4.0] — 2026-07-29

Type a line total straight off the receipt instead of dividing by hand.

### Added

- Line items take a **รวม ฿ (ก่อนลด)** total alongside **ราคา ฿** (#25, closes duplicate #28). Plenty of receipts print only a line total ("pad kra pao 429.12 x4"), so the organizer had to divide before typing anything in. Type either box and the other derives, live, as you type
- A typed total that does not divide evenly rounds the unit price up, so the organizer is never left short: ฿100.00 across 3 settles to ฿33.34 each. The box re-derives to the resulting ฿100.02 with a ปัดขึ้น note, so the adjustment is never silent
- Changing the quantity holds whichever box was actually typed in, because on a receipt the line total is the fact and the quantity is the typo

### Changed

- Item row fields are grouped so a phone-width wrap keeps ราคา/จำนวน/รวม together and never orphans ลด ฿ from ลด %

### Notes

- No schema change. `unit_price_satang` remains the stored truth and the only value the billing engine multiplies out; a typed total is back-derived through the existing exact-BigInt ceil (ADR-0001), never float arithmetic

## [0.3.1] — 2026-07-29

Peer view stops reshuffling itself.

### Fixed

- Peer view column and row order no longer changes on its own (#26). The anon `get_bill` RPC aggregated peers with no `ORDER BY`, and `jsonb_agg` has no defined order without one, so any realtime refetch (someone toggling a paid flag) could return a different peer order. Peers are now ordered by `(added_at, id)`, the same key the organizer's page has always used, and the peer page re-sorts on it client-side
- Peer order no longer varies by browser locale. The client sorted with `localeCompare`, and ICU collation orders `.` before `+`, so two peers on different locales could see opposite column order for timestamps differing only in fractional seconds

## [0.3.0] — 2026-07-26

Payback: peers get a PromptPay QR with their exact amount and one-tap copy paths; the organizer stores payment info once on a new profile page. Plus organizer navigation.

### Added

- Payback (#10): each peer taps their own name (a device-local claim, no login) to reveal a payback panel pinned at the top — a PromptPay QR generated with their exact amount, plus copy-amount, copy-number, and a paid toggle. Works on mobile (the "ทุกคน" list) and desktop (clickable matrix column headers)
- Profile page (`/profile`): organizer stores typed payment info (account name, PromptPay ID, bank name + account) once, with a static QR preview to scan-check their own ID
- PromptPay QR generated entirely client-side from an in-house EMVCo payload builder (`src/lib/billing/promptpay.ts`, golden-vector tested) — no upload, no bank API (ADR-0008/0009)
- Bill editor "ใช้ข้อมูลจากโปรไฟล์" toggle snapshots profile payment info onto a bill, with a per-bill override
- Organizer top-bar navigation: wordmark returns to the bill list, an account menu holds Profile and Sign out; mounted on organizer pages only (peer link pages stay login-free)

### Changed

- Payment info moved from free-form `payment_info`/`payment_method` to typed columns (`promptpay_id`, `bank_name`, `bank_account`, `account_name`) on both profiles and bills; legacy values carried over then dropped, `get_bill` rebuilt (#10)
- Peer page "ทุกคน" rows are now selectable; the old plain "โอนคืนที่" text block is replaced by the generated QR panel

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
