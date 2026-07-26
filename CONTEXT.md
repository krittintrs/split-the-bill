# Split the Bill

Splitting shared restaurant bills among a recurring group of friends: one person pays the restaurant, the app computes who owes what and tracks payback.

## Language

### People

**Organizer**:
The person who paid the restaurant and owns the Bill. Signs in with Google.
_Avoid_: payer, owner, host

**Peer**:
A person who owes a share of a Bill. Exists as an organizer-scoped record so the same person is recognized across bills even if renamed.
_Avoid_: friend, member, participant, user

**Soft Claim**:
A peer tapping their name on a Bill in the browser, without an account. Pins their row and attributes their actions for that device only.

**Account Claim**:
A peer linking their Google account to an organizer's Peer record, once per organizer. Unlocks My Debts.
_Avoid_: registration, binding

### The bill

**Bill**:
One restaurant receipt being split: line items, peers, ticks, charges, and payment info. Has a status of draft, open, or locked.
_Avoid_: sheet, session, event

**Line Item**:
One dish or product on the Bill: name, unit price, quantity. The same dish may appear as multiple Line Items.
Unit price is the stored truth and the only thing the engine multiplies out. The editor also shows a **line total** (unit price × quantity, _before_ the item's own discount) that can be typed instead, since receipts often print only that figure; typing it back-derives the unit price, rounded up per ADR-0001.
_Avoid_: menu, entry, row

**Tick**:
The mark connecting a Peer to a Line Item, meaning "I shared this item." Anyone with the Bill link can tick any cell.
_Avoid_: check, selection, assignment

**Even Split**:
The rule that a Line Item's cost divides equally among all Peers who ticked it.

**Draft / Open / Locked**:
Bill statuses. Draft: organizer still entering, link inactive. Open: peers tick and pay. Locked: organizer froze item Ticks; totals final, Paid Flags stay toggleable. "Everyone paid" is derived (all Paid Flags on), never a status.
UI speaks in lifecycle phases, not mechanisms (decided with #15): Draft = "ฉบับร่าง", Open = "✓ เปิดแล้ว", Locked = "💰 พร้อมเก็บเงิน" (the payback phase locking puts you in). The lock/unlock *buttons* name the mechanism precisely: "ล็อกรายการ" / "ปลดล็อกรายการ" (item Ticks freeze, Paid Flags stay live).
_Avoid_: published, finalized, archived, settled, ปิดยอด (sounds like everyone already paid)

### Money

**Item Discount**:
A discount on one Line Item: percentage applied first, then a fixed amount subtracted.

**Bill Discount**:
A discount on the whole Bill (percentage or amount), allocated proportionally across Line Items.
_Avoid_: promo, voucher

**Service Charge**:
Percentage the restaurant adds to the discounted subtotal (typically 0/5/10%).
_Avoid_: SC (in UI copy), tip

**VAT**:
Percentage added after Service Charge (typically 0/7%).

**Peer Total**:
What one Peer owes: their share of ticked items, then Service Charge, then VAT, rounded up to the satang.
_Avoid_: price per person, share

**Checksum**:
The sum of all Peer Totals, shown for verification against the Receipt Total.

**Receipt Total**:
The amount actually printed on the restaurant receipt, optionally entered by the Organizer.
_Avoid_: bill total, grand total

### Payback

**Payment Info**:
How Peers pay the Organizer back, stored as typed fields (ADR-0009): a **PromptPay ID** (drives the generated QR + copy-number) and/or a **bank account** (bank name + account number, the copyable fallback), plus an **account holder name** shown for payer confirmation. Defaults from the Organizer's profile, snapshot onto the Bill at publish via a "follow profile" toggle (default on), overridable per Bill.
_Avoid_: payment method (the old free-form label; superseded by typed fields)

**PromptPay QR**:
A payback QR generated in the Peer's browser (never uploaded) encoding the Organizer's PromptPay ID and that Peer's *exact satang amount* (EMVCo standard, ADR-0008). A Peer owing ฿0 gets no QR and no payback controls.

**Paid Flag**:
A single per-peer-per-bill toggle meaning "this Peer has paid the Organizer back." Anyone with the link can toggle it on any non-draft Bill, including a Locked one (paying back happens after totals freeze).
_Avoid_: settled, confirmed, payment status

**Unpaid Rollup**:
The Organizer's cross-bill summary of what each Peer record still owes, grouped by Peer, oldest first.
_Avoid_: debt summary, outstanding report

**My Debts**:
An account-claimed Peer's own cross-bill list of unpaid Bills, across all organizers who tagged them.
