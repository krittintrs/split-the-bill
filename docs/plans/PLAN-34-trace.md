# PLAN-34: trace of issue #34 "Calculation bug"

Disposable note. Delete once #34 and #33 are fixed and merged.

Status: **investigation only, no code changed.** Blocked on one datum from the
issue screenshots (see "What is still needed").

## Report

Issue #34: one line item keyed as a single total (ค่าข้าว = 5,555.00), every
member selected, and the computed total is not 5,555. Reported from the
**bill editor** (`/bills/[id]`), not the peer view. Follow-up detail from the
reporter: roughly 12 people on the bill, each showing ~฿1,851.67.

The two screenshots on the issue could not be read during this trace: GitHub's
`user-attachments` host returns 403 from the web sandbox. They are readable
from a local session.

## Two separate defects are tangled in #34

### 1. Wrong split (the real bug)

`src/lib/billing/compute.ts:57` divides each item by `item.tickedBy.length` —
the number of tick rows on that item, not the number of peers on the bill.
`src/lib/bills/mapper.ts:11` builds `tickedBy` purely from the `ticks` table.
The engine itself was verified correct: exact BigInt rationals, one ceil per
peer, no float anywhere.

฿1,851.67 = `ceil(555500 / 3)` satang. So the rendered figure is a ฿5,555 item
split **3** ways, or an item worth 4x that split 12 ways. Two candidate causes,
both in the editor:

**A. qty is not 1.** ฿1,851.67 x 12 = ฿22,220 = 5,555 x 4. The three linked
boxes in `src/app/bills/[id]/BillEditor.tsx:690-780` are ราคา (unit price),
จำนวน (qty) and รวม (line total). Typing 5,555 into ราคา on a row whose qty is
4 stores a ฿22,220 line, and the split then runs over the line total. The
matrix's ฿ column (`MatrixView.tsx:81`) shows `unit_price_satang * qty`, so it
would read 22,220 while the organizer believes they keyed 5,555.

**B. only 3 ticks reached the DB.** 5555/3 = 1,851.67 exactly. In the editor
ticks are optimistic local state, so this only surfaces after a reload, when a
`toggleTick` write failed. Related real defect on the same handler:
`BillEditor.tsx:205` reads `ticked` from the render closure while updating
state functionally, so two fast taps on one cell both see `ticked === false`,
both append, and `computeBill`'s validate throws `item ... ticked twice by:` —
crashing the editor rather than mis-splitting.

### 2. Satang drift — this half is a duplicate of #33

`compute.ts:71` ceils each peer's exact total (ADR-0001: nobody underpays, and
two people sharing an item always owe the same). Consequence: the checksum sits
up to N-1 satang above the receipt.

Verified for a single ฿5,555.00 item, SC 0% / VAT 0%, all peers ticked:

| members | per peer | checksum   | drift |
|---------|----------|------------|-------|
| 2       | 2,777.50 | 5,555.00   | 0     |
| 3       | 1,851.67 | 5,555.01   | +0.01 |
| 5       | 1,111.00 | 5,555.00   | 0     |
| 6       | 925.84   | 5,555.04   | +0.04 |
| 7       | 793.58   | 5,555.06   | +0.06 |
| 9       | 617.23   | 5,555.07   | +0.07 |
| 12      | 462.92   | 5,555.04   | +0.04 |

Working as designed, but `receiptStatus` (`BillEditor.tsx:828`) renders the gap
in red as "✗ ต่างจากใบเสร็จ", which reads as an error. #33 asks for exactly
this: assign the remainder to one person so the total ties to the receipt.

## What is still needed

One of these settles A vs B:

- the จำนวน value on that row in the screenshot, and
- how many names are highlighted on the item.

## Suggested split of work

- **#33** — remainder absorption in `src/lib/billing/`. Organizer self-peer
  (ADR-0010) takes the exact remainder, everyone else ceils. TDD per CLAUDE.md;
  the canonical CSV fixture must stay green.
- **#34** — the tick/qty path in the editor. Confirm A vs B first. Regardless:
  fix the stale-closure duplicate in `BillEditor.onToggle`, and make a failed
  tick write visible rather than leaving the optimistic tick on screen.

## Also noticed (out of scope, not filed)

- `src/lib/billing/itemShare.ts:22` — the peer view's per-item share does its
  own `Math.ceil` on plain numbers and ignores bill discount, service charge
  and VAT. With SC/VAT set, the shares a peer reads will not add up to the
  total they are asked to pay.
- Peer view `/b/[id]`: every tick button carries `disabled={pending}`
  (`PeerBill.tsx:274`) for the whole `set_tick` round trip, so rapid taps are
  silently swallowed; `catch { await refetch() }` (`PeerBill.tsx:172`) also
  swallows RPC failures with no message. Not the cause of #34 as reported, but
  the same class of lost-tick bug.
