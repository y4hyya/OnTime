# OnTime

> Get coffee money when your flight is late.

AI-priced parametric flight insurance for micro-delays. Buy a small premium for any flight; if it's delayed past 30 minutes, your payout is automatic. No claim forms, no phone calls, no waiting.

**Live demo:** https://on-time-chi.vercel.app

<!-- screenshot or Loom embed goes here post-recording -->

## How payouts work

| Delay | Payout |
|---|---|
| 30+ min | 2× premium |
| 60+ min | 3× premium |
| 120+ min | 6× premium |
| Cancelled | 20× premium |

The AI prices the **premium** per flight based on route, airline, day-of-week, time-of-day, and season. Multipliers are fixed and visible up-front, so you always know what you'd get. A hard T-2h cutoff applies — no policies sold within 2 hours of scheduled departure (this prevents adverse selection once delays are visible on the airport board).

Example: a $2 premium pays out $4, $6, $12, or $40 across the four tiers.

## Built with

- **[Next.js 16](https://nextjs.org)** App Router, Turbopack, TypeScript
- **[Tailwind CSS v4](https://tailwindcss.com)** + **[shadcn/ui](https://ui.shadcn.com)** for styling and primitives
- **[Clerk](https://clerk.com)** for authentication
- **[Supabase Postgres](https://supabase.com)** + **[Drizzle ORM](https://orm.drizzle.team)**
- **[Stripe](https://stripe.com)** (test mode) for checkout
- **[Google Gemini](https://ai.google.dev)** for the quote, claim, and support agents
- **[AeroDataBox](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)** via RapidAPI for flight data
- **[Resend](https://resend.com)** for transactional email
- Deployed on **[Vercel](https://vercel.com)** with cron-driven flight monitoring

## Run locally

```sh
pnpm i
cp .env.example .env.local   # fill in keys for the services above
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000.

To exercise the trigger logic without waiting for a real flight to be late, seed three demo personas:

```sh
pnpm tsx scripts/seed-demo.ts
```

## Status

Simulated MVP — not yet a licensed insurance product. Stripe runs in test mode; no real money flows. Built solo for the YC Summer 2026 application.
