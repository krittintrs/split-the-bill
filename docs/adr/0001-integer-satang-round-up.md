# Money is integer satang; peer totals round up

All money is stored and computed as integer satang; conversion to ฿ happens only at display. Each Peer Total rounds UP to the next satang after the charge pipeline, so the Checksum may exceed the Receipt Total by a few satang (organizer keeps the surplus, no payer ever underpays).

**Considered options:** float baht (what the Google Sheet did — produced values like 207.3333 and silent drift), largest-remainder exact allocation (checksum exactly equals receipt, but two peers sharing identically can owe different amounts, which reads as a bug). Round-up was chosen for explainability over exactness.
