# Bartola Budget

A daily **Safe-to-Spend** budgeting app for people living off a fixed pool of money over a fixed period. Open the app, see one number, know whether you can afford the thing.

Spec: [`BARTOLA-BUDGET-BUILD-BRIEF.md`](./BARTOLA-BUDGET-BUILD-BRIEF.md) · Plan: [`IMPLEMENTATION-PLAN-V1.md`](./IMPLEMENTATION-PLAN-V1.md)

## Stack

Next.js 16 (App Router, React 19, TypeScript) · Tailwind CSS v4 · Prisma · Vitest · Luxon (America/New_York) · decimal.js · self-built auth (jose + bcryptjs).

## Run it locally

```bash
npm install
npm run db:seed     # creates the SQLite DB + the "Maria" demo user
npm run dev         # http://localhost:3000
```

**Demo login:** `maria@demo.bartola` / `demo1234`

The `.env` needs `DATABASE_URL` (SQLite: `file:./dev.db`) and `AUTH_SECRET` (any long random string).

## Scripts

| Command | What it does |
|---|---|
| `npm test` | Engine unit tests — reproduces the brief's Section 5 examples to the cent |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run db:seed` | Seed the demo user + plan |

## Architecture

- **`src/engine/`** — the pure, isolated, unit-tested recalculation engine. Integer cents, no I/O, no framework imports. This is the product; everything else is packaging.
- **`src/lib/data.ts`** — data-access layer: maps the DB to the engine's input, always scoped by `userId`.
- **`src/app/actions.ts`, `auth-actions.ts`** — Server Actions (each verifies the session and ownership).
- **`src/app/*`** — screens: `/login`, `/onboarding`, `/` (Home), `/log`, `/programs`, `/programs/new`, `/programs/[id]`, `/settings`, `/history`.
- **`src/app/api/rollover`** — the daily rollover job (point a cron at it).

The demo clock is hardcoded (`APP_ASOF` in `src/lib/data.ts`) because the demo plan runs Sep 2026–Aug 2027; in production this becomes the current date in America/New_York.

## Deploying to Vercel (Postgres)

The app is configured for **Postgres** in production (serverless filesystems are read-only, so SQLite can't be used there). `vercel.json` runs `prisma db push` during the build to create the tables, so no manual migration step is needed.

1. Import this repo into Vercel.
2. Add **Neon Postgres** storage in the Vercel project (Storage tab) — it injects `DATABASE_URL` automatically.
3. Add an `AUTH_SECRET` environment variable (any long random string).
4. Deploy. The build runs `prisma generate && prisma db push && next build`.
5. Open the app, sign up, and onboard.

**Local development** now also uses Postgres — point `DATABASE_URL` at your Neon database (or a Neon dev branch), then `npm run db:seed && npm run dev`.

## Status

All gates green: `npm test` (engine reconciles the brief to the cent), `npm run build`, `npm run lint`.

**Open items:** confirm the brand purple (`#5B21EE` is a placeholder), and the Postgres swap above for production.
