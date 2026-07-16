# Design

Visual system for Split the Bill. Decided 2026-07-15 via the `/prototype/tokens` comparison (branch `prototype/8-bill-editor`); tokens land in `src/app/globals.css` (#8 Task 1). Register: product — design serves the task; earned familiarity over novelty.

## Theme

Light, bright, cyan-washed. One theme only for v1 (dark mode deferred to BACKLOG — remove the starter's `prefers-color-scheme` flip rather than ship a half-designed dark). The lightness lives in **surfaces** (washed page, tinted chips); interactive fills use the deeper, readable cyan. Scene: a phone at an outdoor lunch table and a desktop browser at a desk — bright ambient light, so contrast wins every tie.

## Color

Brand anchor is the owner's personal cyan `#0cc0df` — used decoratively only (illustrations, mascot later), never as a text-bearing fill.

| Token | Value | Use | Contrast notes |
|---|---|---|---|
| `--color-brand` | `#0cc0df` | decorative anchor only | never under text |
| `--color-primary` | `#069ec8` | buttons, ticked chips, selection, active states | white text 3.1:1 — below AA, accepted deviation (see Known deviations) |
| `--color-primary-deep` | `#0782a5` | hover/active of primary | |
| `--color-primary-ink` | `#0e7490` | links, small primary-colored text on light | 5.6:1 on white |
| `--color-bg` | `#e6f7fb` | page background (the wash) | carries no text directly |
| `--color-surface` | `#ffffff` | cards, table, inputs | |
| `--color-surface-tint` | `#d8f3f9` | idle chips, subtle fills | with `--color-primary-ink` text |
| `--color-border` | `#bee9f2` | borders, dividers | |
| `--color-ink` | `#123c4a` | body text | 12+:1 on surface |
| `--color-ink-muted` | `#4b6e7a` | secondary text | ≥4.5:1 on bg and surface |
| `--color-success` | `#059669` | checksum ✓, paid | always with icon shape |
| `--color-danger` | `#dc2626` | checksum ✗, unticked warning | always with icon shape |
| `--color-warning-ink` | `#b45309` | amber-toned notices | |

Rules: **selection ≠ success** — ticked chips are primary cyan; ✓/✗ verdicts are green/red and never rely on color alone (AA). Semantic colors never decorate. One loud element per screen: the primary action gets `--color-primary`; secondary actions are outlined or tinted.

### Known deviations (accepted 2026-07-16)

White text on filled controls measures below WCAG AA's 4.5:1: `#069ec8` primary fills = 3.12:1, `#0782a5` hover = 4.43:1, `#059669` success badges = 3.77:1 (also green-on-white ✓ text at 3.77:1). An AA-passing darker ramp (`#077f9f` / `#066a85` / `#047857`) was built and compared on screen; the owner chose to keep the vivid ramp — the darker one lost the light & playful feel that is the app's identity. Deliberate trade-off, not an oversight; the WCAG large-text exemption does not apply at our sizes. Revisit if real peers report readability problems (outdoor phone use is the likely trigger). Everything else stays AA: body text, muted text, and all non-fill color pairs must still clear 4.5:1.

## Typography

- **Noto Sans Thai** (weights 400 / 500 / 700) via `next/font/google`, subsets `thai` + `latin` — one family everywhere; no display font.
- Money is always `tabular-nums`, format `฿1,234.50` (`formatSatang` is the only place satang becomes ฿).
- Fixed rem scale, ratio ~1.2: 12 / 14 / 16 (body) / 20 / 24. Minimum 12px (constitution).
- Any white-on-primary text is bold ≥14px; smaller primary-colored text switches to `--color-primary-ink` on light. (Note: WCAG's large-text exemption starts at 14**pt** bold ≈ 18.66px, so bold 14px does NOT make 3.1:1 pass AA — see Known deviations.)

## Shape & Spacing

- Cards / inputs / buttons: `rounded-xl` (12px). Chips and pills: `rounded-full`.
- Touch targets ≥44px (chips and icon buttons are `min-h-11` / `h-11 w-11`; matrix tick cells ≥ 44×48px zone).
- Spacing on the Tailwind 4 default scale; card padding 12–16px; page gutter 16px mobile / centered max-width on desktop.

## Components (editor vocabulary, from the layout prototype verdict)

- **Peer chip**: full first-name label. Idle = `--color-surface-tint` bg + `--color-primary-ink` text; ticked = `--color-primary` bg + white bold text. No ฿ amount inside chips — each item card shows one `÷ n = ฿x each` muted line instead. Initial-only circles are a >8-peers polish, not v1.
- **Matrix (desktop ≥lg)**: items as rows, peers as columns; sticky item column + header; per-peer totals in the footer, then checksum. Feels like an app, not the Sheet: generous row height, chips-in-cells, no gridline soup.
- **Stacked cards (mobile <lg)**: one card per line item, chips inside, sticky expandable bottom bar (checksum + receipt ✓/✗ always visible, per-peer totals on expand).
- **Checksum bar**: the emotional center — ✓ green "ตรงกับใบเสร็จ" / ✗ red with the difference, icon + text, never color alone.
- Every interactive component ships default / hover / focus-visible / active / disabled states; skeletons over spinners; empty states teach ("ยังไม่มีบิล — สร้างบิลแรก").

## Motion

150–250ms, ease-out, state-conveying only (chip toggle, bar expand, ✓/✗ flip). No page-load choreography. `prefers-reduced-motion: reduce` → crossfade or instant.
