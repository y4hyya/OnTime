# OnTime

AI-priced parametric flight insurance. Tiny premiums, automatic payouts the moment your flight slips past 30 minutes — no claim forms, no waiting.

## How it works

| Delay | Payout |
|---|---|
| 30+ min | 2× premium |
| 60+ min | 3× premium |
| 120+ min | 6× premium |
| Cancelled | 20× premium |

The AI prices the premium per flight based on route, airline, day, weather, and prior leg status. Multipliers are fixed and visible up-front. A hard T-2h purchase cutoff applies — no policies sold within 2 hours of scheduled departure.

## Develop

```sh
pnpm i
cp .env.example .env.local   # then fill in keys
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000.

Required services: Clerk (auth), Supabase (Postgres), Anthropic (AI), Stripe test mode (payments), AeroDataBox via RapidAPI (flight data), Resend (email).

## Status

Simulated MVP — not yet a licensed insurance product. Test mode only; no real money flows.
