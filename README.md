# Energy Tracker

Tracks electricity use from TOMZN TOVA 63T breakers through Tuya Cloud, works out monthly bills on
Bangladesh slab tariffs, and shows how much the solar inverter saves (from a solar breaker, or straight
from Deye Cloud for Deye inverters). Read-only towards the devices.

Design decisions and the data model are in [PLAN.md](PLAN.md). Server setup is in [DEPLOY.md](DEPLOY.md).

## Local development

Needs Node 22+ and PostgreSQL 14+.

```sh
cp .env.example .env     # fill in DATABASE_URL, BETTER_AUTH_SECRET, Tuya keys, SEED_ADMIN_*
npm install
npm run db:migrate
npm run seed:admin       # first super admin from SEED_ADMIN_*
npm run seed:tariffs     # BERC LT-A residential rates (June 2026)
npm run dev              # http://localhost:3000
npm run poller           # in a second terminal: reads the breakers every minute
```

`npm run poller -- --once` runs a single poll and exits, which is handy for testing.

## Scripts

| Script | What it does |
|---|---|
| `dev` / `build` / `start` | Next.js |
| `poller` | Polls Tuya every `POLL_INTERVAL_SECONDS`; hourly stores finished bills and prunes old readings |
| `db:generate` / `db:migrate` / `db:studio` | Drizzle schema migrations |
| `seed:admin` / `seed:tariffs` | First super admin, default tariff (both safe to re-run) |
| `test` | Unit tests for bill maths, counter deltas, data-point decoding, cost shares, balance days |
| `typecheck` / `lint` | Checks |

## Where things live

| Path | |
|---|---|
| `src/lib/tuya/` | Tuya Cloud client (signing, token, batch status) and data-point decoding |
| `src/lib/deye/` | Deye Cloud client (token, stations, latest, daily history) and payload decoding |
| `src/lib/solar-poll.ts` | Deye snapshots every 5 min, daily totals, one-time year backfill |
| `src/lib/energy.ts` | Counter deltas, reset handling, Dhaka day boundaries |
| `src/lib/poll.ts` | One poll cycle; `scripts/poller.ts` runs it on a timer |
| `src/lib/billing.ts` | Slab/lifeline bill maths, next price step, billing cycles (pure) |
| `src/lib/billing-data.ts` | Meter bills, solar savings, projections, finalising past cycles |
| `src/app/(app)/` | Pages: dashboard, bills, meters, devices, tariffs, admin |
