# Product

## Register

product

## Users

A household in Bangladesh with Tuya-connected TOVA 63T breakers and an off-grid solar inverter. Two kinds of visits,
equally common:

- **Glances on a phone** by any family member during the day: how much power is being drawn right now, how this
  cycle is going, are we about to cross into a pricier slab, what will the bill be.
- **Sessions on a laptop** by the owner: reading charts, checking bills against the utility's, managing meters,
  breakers and tariff rates.

## Product Purpose

Turn raw breaker readings into answers about money: what the electricity bill will be under the Bangladesh slab
tariff, how close the household is to the next price step, and how much the solar inverter saves. Success is that a
family member can open it, understand the situation in two seconds, and adjust usage before a slab is crossed.

## Brand Personality

Calm instrument. Precise, quiet, trustworthy. Like a well-made thermostat or the Apple Home and Weather apps: big
glanceable numbers, clean surfaces, soft purposeful motion, nothing shouting. Numbers are the hero; chrome stays out
of the way.

## Anti-references

- Generic admin panels and default shadcn/Bootstrap templates (gray cards in a grid, tables everywhere).
- Crypto and trading dashboards: neon gradients, glowing tickers, dense flashing charts.
- SaaS hero-metric templates with gradient accents.

## Design Principles

1. **Answer first, detail on demand.** Every screen leads with the one number that matters (power now, projected
   bill); breakdowns sit one level down.
2. **Money in context.** kWh are always paired with what they cost and where they sit on the slab ladder.
3. **Calm by default, alert when it matters.** The interface is quiet until a slab is about to be crossed or a
   breaker goes offline; then it speaks clearly once.
4. **Glanceable on a phone, explorable on a laptop.** Same information, layouts tuned for each.
5. **Honest numbers.** Show when data is partial, stale or estimated; never dress up a projection as a fact.

## Accessibility & Inclusion

WCAG 2.2 AA: 4.5:1 body text contrast, 3:1 for large numbers and chart marks. Colour is never the only signal
(labels and icons accompany grid/solar and status colours). All motion respects `prefers-reduced-motion`. Readable
for non-technical family members: plain words, no jargon beyond kWh.
