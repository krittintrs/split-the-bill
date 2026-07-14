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
_Avoid_: menu, entry, row

**Tick**:
The mark connecting a Peer to a Line Item, meaning "I shared this item." Anyone with the Bill link can tick any cell.
_Avoid_: check, selection, assignment

**Even Split**:
The rule that a Line Item's cost divides equally among all Peers who ticked it.

**Draft / Open / Locked**:
Bill statuses. Draft: organizer still entering, link inactive. Open: peers tick and pay. Locked: organizer froze it; nothing changes.
_Avoid_: published, finalized, archived

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
How Peers pay the Organizer back: a PromptPay ID and/or bank-account text. Defaults from the Organizer's profile, overridable per Bill.

**Paid Flag**:
A single per-peer-per-bill toggle meaning "this Peer has paid the Organizer back." Anyone with the link can toggle it.
_Avoid_: settled, confirmed, payment status

**Unpaid Rollup**:
The Organizer's cross-bill summary of what each Peer record still owes, grouped by Peer, oldest first.
_Avoid_: debt summary, outstanding report

**My Debts**:
An account-claimed Peer's own cross-bill list of unpaid Bills, across all organizers who tagged them.
