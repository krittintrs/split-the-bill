# Product

## Register

product

## Platform

web

## Users

A Bangkok tech team that eats lunch together daily. Primary: the organizer (this repo's owner) — pays the restaurant, signs in with Google, builds the bill on phone or desktop, often one-handed at the table. Secondary: 4–10 teammates ("peers") who open a shared link from the team's Slack — on desktop at their desks or on phones — with zero login, tick what they ate, and pay back. Peer-facing screens must render Thai names and menus correctly; amounts display as `฿1,234.50`.

## Product Purpose

Replace the team's shared Google Sheet for splitting itemized restaurant bills: line items, per-item and whole-bill discounts, service charge, VAT, per-person totals with a checksum against the paper receipt, PromptPay payback, and a cross-bill "who still owes me" rollup. Success: the team uses it for a real lunch instead of the Sheet, and old debts stop being forgotten.

## Positioning

ขุนทอง-style bill splitting without the bank or the spreadsheet: peers need nothing but the link, and the math is exact to the satang with a receipt checksum — on whatever browser Slack opens.

## Brand Personality

A calm money tool with a friendly face: trustworthy, clear, quietly confident — numbers nobody double-checks — carried on a fresh cyan identity (the owner's personal color) rather than banking green. Warmth comes through color and copy now; a friendly mascot is planned post-MVP to soften it further. Never formal, never childish.

## Anti-references

- Corporate banking apps (KBank/K PLUS formality, security theater, dense legal chrome) — peers are eating lunch, not applying for a loan.
- Childish sticker chaos — playful is fine, but it's still money; no emoji confetti. (A single well-designed mascot later is voice, not chaos.)
- The Google Sheet it replaces — even the desktop matrix must feel like an app, not styled cells.
- Khunthong/K-anything green — any green money app in Thailand reads as "K-something"; the identity is cyan.

## Design Principles

1. **The tool disappears into the lunch.** Every screen serves one task (build, tick, or pay); no ceremony, no onboarding tours.
2. **Numbers are the product.** Money is always legible, tabular, satang-exact; the checksum ✓/✗ is the emotional center of the editor.
3. **One loud thing per screen.** The primary action owns the deep cyan; everything else stays washed and calm.
4. **Selection is not success.** Ticked chips speak the primary color; ✓/✗ verdicts and paid states keep semantic green/red, always paired with an icon shape.
5. **Both thumbs and mice are first-class.** Matrix on desktop, stacked cards on mobile — the same bill, never a degraded version.

## Accessibility & Inclusion

WCAG AA baseline: body text ≥ 4.5:1, bold/large text ≥ 3:1, touch targets ≥ 44px, visible focus states, color never the only signal (✓/✗ icons accompany green/red), `prefers-reduced-motion` respected. Designed for the worst real environment: a phone outdoors at a lunch table.
