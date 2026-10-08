# Design

Visual system for the Energy Tracker. Strategy and voice live in [PRODUCT.md](PRODUCT.md). Tokens are in
`src/app/globals.css`.

## Theme

Follows the device (light by day, dark in the evening); the account menu can pin Light or Dark.
Restrained colour: tinted neutrals, ink-coloured primary actions, and two fixed identity colours.

| Role | Light | Dark | Use |
|---|---|---|---|
| Canvas `--background` | oklch(0.982 0.004 255) | oklch(0.145 0.006 255) | Page behind panels |
| Surface `--card` | white | oklch(0.19 0.008 255) | Panels |
| Ink `--foreground` / `--primary` | oklch(0.2 0.014 255) | oklch(0.96 0.004 255) | Text, primary buttons |
| Muted text | oklch(0.49 0.014 255) | oklch(0.74 0.012 255) | Labels, hints (≥4.5:1) |
| `--grid` | #2a78d6 | #3987e5 | Grid power everywhere: charts, live dot, ladder fill |
| `--solar` | #eb6834 | #d95926 | Solar everywhere; always with a sun icon |
| `--warning` / `--warning-surface` | amber text on pale amber | light amber on dark amber | Only "you'll cross a slab soon", with an icon |
| `--destructive` | red | red | Offline breakers, destructive actions |

Grid/solar are the dataviz skill's validated pair; never reuse them for anything else.

## Type

Geist only, weight and size for hierarchy. Big figures: 52–64px, semibold, -0.04em tracking, tabular
numbers, unit at 40% size in muted ink. Page titles 28px semibold, -0.025em. Panel titles 15px semibold.
Labels 12px medium muted. No all-caps eyebrows.

## Surfaces

- Panels: `rounded-3xl bg-card ring-1 ring-foreground/[0.07]`, padding 20–28px. One level only.
- Inside a panel: divided rows (`border-t`) or tinted wells (`rounded-xl bg-muted/60`), never bordered boxes.
- Controls: 36px tall, `rounded-lg`. Segmented controls are pills with a sliding thumb.

## Motion

All motion conveys state and is disabled under `prefers-reduced-motion`.

| Pattern | Where | Spec |
|---|---|---|
| `.rise` | Panels on navigation, tab panel switch | 420ms ease-out-expo, 8px rise, 50ms stagger via `--i` |
| `AnimatedNumber` | Live power, bills, stats | Glides to new value on refresh (900ms expo); no count-up on load |
| `.fill-bar` | Slab ladder, share bars, cycle progress | Grows from 0 on first paint (`@starting-style`), 700ms glide on change |
| `.marker-glide` | Ladder "now" / "projected" markers | translateX only, 700ms |
| `.live-dot` | "Live" badge | 2.4s breathing halo |
| Sliding thumb | Top nav, segmented tabs | 300ms transform + width |
| Popover | Account menu | Fade + 6px settle, 260ms |

## Signature component

**Slab ladder**: the tariff as price steps sized by kWh, filled to this cycle's usage, with the projection
as a lighter extension and the lifeline limit marked. Every step shows its Tk/kWh. It answers "how close
are we to paying more" without reading a table.
