# SmartHome Energy Tracker — Plan

Track electricity use from TOMZN TOVA 63T breakers (Tuya Cloud) and work out monthly bills
with Bangladesh slab tariffs, plus money saved by solar.

## Decisions

| Topic | Decision |
|---|---|
| Tuya | Cloud project on the Central Europe data centre (`https://openapi.tuyaeu.com`). Two Smart Life app accounts linked to the project. |
| Access | **Read-only.** The app never sends commands to devices. |
| Users | Roles: `super_admin` (sees and manages everything) and `user` (manages own profile). Email + password login. |
| Profiles | Each profile is linked to one Tuya app account (UID). A profile has many meters; a meter belongs to one profile. |
| Devices | Up to about 15 devices. Each 63T is `grid` (belongs to a meter) or `solar` (has a reference meter + a paired inverter-input device). No nested 63Ts, so meter total = sum of its grid devices. |
| Tariffs | Stored as data (tariff plans + slabs, versioned by effective date). Chosen per meter. Not hard-coded. |
| Solar | Off-grid hybrid inverter with battery. Its grid input has its own 63T. Saving = `bill(meter kWh − inverter input + inverter output) − bill(meter kWh)` |
| Alerts | None. |
| Hosting | Friend's server via aaPanel. Docker if available, otherwise PM2 + PostgreSQL + Nginx. HTTPS through a free DuckDNS subdomain + Let's Encrypt. |
| Timezone | Asia/Dhaka |

## Device data points (63T)

| Code | Use |
|---|---|
| `forward_energy_total` | Cumulative energy, scale 2 (19815 = 198.15 kWh). **Billing source.** A drop in value = counter reset → new baseline. |
| `phase_a` | Base64 raw: bytes 0–1 voltage /10 V, bytes 2–4 current /1000 A, bytes 5–7 power /1000 kW |
| `power_factor` | /100 (not reported by the current units; stored when present) |
| `supply_frequency` | /10 Hz |
| `leakage_current` | mA |
| `temp_zone_1` | °C (not reported by the current units; stored when present) |
| `online_state` | `online` / `offline` |

## Stack

- Next.js (App Router) + TypeScript, Tailwind + shadcn/ui, ECharts
- PostgreSQL + Drizzle ORM
- Better Auth (email/password, roles)
- Poller: a separate Node process that runs every minute and fetches all devices in one batch request

## Data model

`users` · `profiles` · `profile_members` · `tariff_plans` · `tariff_slabs` · `meters` · `devices` ·
`readings` (per poll) · `daily_energy` (summary) · `bills` (stored slab breakdown)

## Billing

- Energy per device = change in `forward_energy_total` (with reset handling), summed per meter per billing cycle.
- Bill = slab energy charge (or lifeline rate if the month is ≤ the lifeline limit) + demand charge × sanctioned kW − rebate % of (energy + demand) + VAT % of (energy + demand − rebate) + meter rent.
- A cycle uses the tariff version in force on its first day. Cycles that began before tracking started are stored as **partial**.
- Projected bill for the current month, and "units left until the next slab".

## Phases

1. Project setup, database schema, login + roles, profile management
2. Tuya client + poller, `phase_a` decoding, counter-reset handling, add-device flow — **done** (`npm run poller`, `/devices`)
3. Tariff plan + meter screens — **done** (`/tariffs`, `/meters`, `npm run seed:tariffs`)
4. Dashboard: live power, daily/monthly charts, grid vs solar — **done**
5. Bills, projected bill, slab warning, solar savings — **done** (`/bills`; poller stores finished cycles hourly)
6. Deploy on aaPanel + DuckDNS HTTPS (step-by-step guide) — **done** ([DEPLOY.md](DEPLOY.md), Docker + PM2)
