# One fixed charge pipeline, extracted from 61 real bills

Per-peer math is fixed: item discount (% first, then amount) → even split among tickers → Bill Discount allocated proportionally → × (1 + Service Charge %) → × (1 + VAT %) → round up. This exact order was reverse-engineered from the group's spreadsheet formulas across 61 real bills (Dec–Jun), including the manual proportional spreading of whole-bill discounts the app now automates.

**Considered options:** configurable bases (toggle whether VAT includes Service Charge, etc.) — rejected because no real bill needed it and it quadruples the test surface. If a restaurant's receipt ever disagrees, the organizer adjusts rates/amounts to match the receipt rather than reconfiguring the pipeline.
