# Split the Bill

Splitting shared restaurant bills among a recurring group of friends: one person pays the restaurant, the app computes who owes what and tracks payback.

## Language

### People

**Organizer**:
The person who paid the restaurant and owns the Bill. Signs in with Google. Usually ate too, and joins their own Bill as a Self-Peer (ADR-0010). Their peer-facing name is their **Display Name**, set on `/profile` and defaulted from their Google account.
_Avoid_: payer, owner, host

**Peer**:
A person who owes a share of a Bill. Exists as an organizer-scoped record so the same person is recognized across bills even if renamed.
_Avoid_: friend, member, participant, user

**Self-Peer**:
The Organizer's own Peer record, marked by `peers.linked_user_id = organizer_id` and added to every Bill on creation. Ticks and totals like any Peer, but owes nobody: no PromptPay QR, no Paid Flag, excluded from the Unpaid Rollup's debt (ADR-0010). Remove it from the rare Bill you only paid for.
_Avoid_: owner peer, self row, ghost peer

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
What one Peer owes, in THB satang: their share of ticked items, then Service Charge, then VAT, then FX Rate (if the Bill has a Purchase Currency), rounded up once. Always the number that actually settles the debt (drives the PromptPay QR and Paid Flag), never the Purchase Currency figure.
_Avoid_: price per person, share

**Checksum**:
The sum of all Peer Totals, in THB satang, shown for verification against the Receipt Total (× FX Rate, if the Bill has a Purchase Currency). Ties exactly via the Rounding Absorber (ADR-0011).

**Receipt Total**:
The amount actually printed on the restaurant receipt, optionally entered by the Organizer, in the Bill's Purchase Currency (THB when none is set).

**Purchase Currency**:
The currency actually printed on the restaurant receipt when it isn't THB (e.g. TWD), set once per Bill as a free-text label, editable until Locked. Optional — a Bill with none is pure THB, unchanged from before this concept existed. Never mixed within one Bill: one receipt, one currency (a multi-currency trip is multiple Bills, each with its own Peer Total, Checksum, Receipt Total). Always treated as 2-decimal-place minor units, the same shape as satang, even for currencies that don't really have a subunit (e.g. JPY) — no live rate lookup, no currency metadata table.
_Avoid_: source currency, foreign currency

**FX Rate**:
The manually-entered conversion rate on a Bill with a Purchase Currency: THB per 1 unit of that currency (e.g. 1 TWD = 1.15 THB), multiplying a Purchase Currency amount into THB. Stored and applied as an exact fraction, never a float. Editable until Locked, same as Service Charge and VAT — changing it live-reflows every Peer Total and QR. There is no other settlement currency: PromptPay only ever pays out in THB, so nothing but Purchase Currency is ever selectable.
_Avoid_: exchange rate (fine in conversation, but code and UI copy say FX Rate), conversion rate

**Purchase Subtotal / Purchase Checksum**:
The same Subtotal / Checksum figures, but in the Bill's Purchase Currency, before the FX Rate is applied — the "does my math match the paper receipt" check, independent of and in addition to the THB Checksum's "did the conversion tie out" check. Only meaningful when the Bill has a Purchase Currency; identical to the THB figures otherwise.
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
The Organizer's cross-bill summary of what each Peer record still owes, grouped by Peer, oldest first. The Organizer's own Self-Peer never appears as debt; their share shows as context so the figures reconcile against the receipt (ADR-0010).
_Avoid_: debt summary, outstanding report

**My Debts**:
An account-claimed Peer's own cross-bill list of unpaid Bills, across all organizers who tagged them.
