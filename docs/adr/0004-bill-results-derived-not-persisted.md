# Bill results are derived, never persisted

`computeBill(input)` output (Peer Totals, Checksum, Receipt Total, item splits) is recomputed from stored facts on every read; it is never written to the database. Supabase stores only what humans decided: items, prices, discounts, rates, ticks, paid flags. Rule of thumb: store what humans decided, compute what math decides.

**Considered options:** persisting totals on the bill (the Google Sheet's model, where formulas and values lived together) — rejected because every tick mutation would need a synchronized recompute and any missed one silently desyncs money from ticks, the Sheet's exact failure mode; caching computed totals — rejected as premature, a lunch bill recomputes in microseconds.
