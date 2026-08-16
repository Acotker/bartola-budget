# Bartola Budget — v1 Implementation Plan

> Companion to `BARTOLA-BUDGET-BUILD-BRIEF.md`. The brief is *what* to build; this is *how and in what order*. Two people (Carlos + Anna) build this with Claude Code, so it's written to be picked up by either side.

---

## 0. Guiding principle

Section 4 (the engine) is the product. **Build the engine and make Section 5's worked examples pass to the cent before writing any UI.** Everything else is packaging. When in doubt, defer to "the user opens the app, sees one number, and knows if they can afford the thing."

---

## 1. Tech stack (locked for v1)

Already scaffolded: **Next.js 16.3.1 (App Router) · React 19 · TypeScript · Tailwind CSS**. Filling in the rest:

| Concern | Choice | Why |
|---|---|---|
| Database | **PostgreSQL** (Neon, provisioned via the Vercel integration) | Serverless-friendly, free tier, zero-ops, injects `DATABASE_URL` into Vercel automatically. |
| ORM / migrations | **Prisma** | Conventional, type-safe, great DX, versioned migrations both devs share. |
| Auth | **Clerk** (email/password) | Fastest reliable real auth; gives a stable `userId` to scope every row for per-user data isolation. *(Alternative considered: Auth.js v5 credentials — self-contained but more wiring and beta on Next 16. Clerk wins for a hackathon.)* |
| Engine tests | **Vitest** | Fast, TS-native. Section 5 becomes the test suite. |
| Dates / recurrence | **Luxon**, pinned to `America/New_York` | Correct month-end anchors, month-boundary projection, and DST — the exact places this class of app breaks. |
| Money math | **Integer cents** for all stored/transacted amounts; a **decimal type** (`decimal.js`) for the Baseline *rate* only | Brief forbids floats. The Baseline is `UR / RD` (a rate, rarely a whole cent), so it needs exact decimal handling to reproduce examples to the cent. |
| Deploy | **Vercel** (Carlos's step) | Auto-deploy on push, already the team's pipeline. |

**One decision I did NOT make for you** — see §10.

---

## 2. External setup required (humans only — Claude can't create accounts)

These are the "outside the terminal" steps, flagged up front so nobody's blocked mid-build. I'll walk you through each when we reach it.

1. **Database** — In the Vercel dashboard → Storage → add **Neon Postgres**. It auto-adds `DATABASE_URL`. *(Or Neon.com directly; either works.)*
2. **Clerk account** — clerk.com → create an application → copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
3. **Vercel env vars** — paste the Clerk keys into Vercel project settings so the deployed app has them.
4. **Local `.env`** — the same keys locally (already git-ignored, so secrets never get committed).

Until #1 and #2 exist, we can still build and test **the entire engine** (it's pure and needs no DB or auth).

---

## 3. Architecture — four clean layers

```
┌─────────────────────────────────────────────────────────┐
│  UI  (React Server + Client Components, Tailwind)        │  ← screens §7 of brief
├─────────────────────────────────────────────────────────┤
│  Server Actions / Route Handlers                         │  ← mutations + daily rollover
│    - authenticated, validate input, call data layer,     │
│      then call the engine, persist, revalidate           │
├─────────────────────────────────────────────────────────┤
│  Data Access Layer  (Prisma queries, ALWAYS user-scoped) │  ← the only place that touches the DB
├─────────────────────────────────────────────────────────┤
│  ENGINE  (pure TypeScript, zero I/O, unit-tested)        │  ← Section 4/5. The product.
└─────────────────────────────────────────────────────────┘
```

**Hard rule:** no engine math in UI components or route handlers. The engine imports nothing from Next, Prisma, or the DOM.

---

## 4. Data model (Prisma schema — refined from brief §9)

- **User** — mirror of Clerk user: `id` (= Clerk userId), `email`. (Clerk owns credentials; we store a thin row to hang data off.)
- **Plan** — `id`, `userId`, `poolAmountCents` (int), `startDate`, `endDate`, timestamps. One active per user.
- **PlanAdjustment** — `id`, `planId`, `type` (`income_add` | `pool_edit` | `date_edit`), `amountCents`, `oldValue`, `newValue`, `date`, `note`.
- **ProgramSpend** — `id`, `planId`, `name`, `isRecurring`, `recurrenceRule` (JSON: `{freq: weekly|biweekly|monthly, anchorDay}`), `amountPerOccurrenceCents`, `startDate`, `endDate`, `targetDate` (one-time), `status` (`active` | `completed` | `cancelled`).
- **SpendEntry** — `id`, `planId`, `date`, `amountCents`, `type` (`s2s` | `program`), `programSpendId?`, `occurrenceRef?` (which occurrence, e.g. an ISO date key), `note?`, timestamps.

**Occurrences are derived** from the recurrence rule at read time (not materialized rows) — no drift to keep in sync.

**S2S accumulated balance:** derived by replaying the ledger (see §5) for v1. If performance ever bites, cache into an optional `S2SDailyLedger` table — but start derived, it's correct and the dataset is tiny.

All amounts are **integer cents**. No floats in any column.

---

## 5. The engine — design & the precision trap

The engine is **two functions**, both pure:

### 5a. `occurrencesFor(programSpend, runwayStart, runwayEnd): DateKey[]`
Expands a recurrence rule (weekly / bi-weekly / monthly with an anchor day, or a single `targetDate`) into concrete dates through the Runway end, using Luxon in `America/New_York`. Month-end anchors (e.g. "31st" in a 30-day month) and DST are handled here. **Unit-tested independently** — Maria's rent → 12 dates, groceries → 52, trips → 12.

### 5b. `computePlanState(plan, programSpends, spendEntries, asOf): PlanState`
Deterministic, side-effect free. Returns `{ baselineCents, s2sBalanceCents, programBuckets[], isDeficit, ... }`. Internally:

1. Replay time from plan start → `asOf`, segment by segment between recalc events, to reconstruct the **accumulated S2S balance** (`B_s2s`) and each program bucket's carried surplus (`B_prog`). Baseline is constant within a segment and only changes at a recalc trigger (§4 of brief).
2. Assemble the snapshot: `P, A, ARP, RC, B_prog, B_s2s, RD` exactly per the brief's symbol table.
3. `UR = ARP − RC − B_prog − B_s2s`; `Baseline = UR / RD`; `isDeficit = Baseline ≤ 0`.

**The two rules we must not get wrong (brief §4):**
- Subtract preserved balances (`B_s2s`, `B_prog`) out of `UR` — else the same dollar is spendable twice.
- A negative S2S balance is **absorbed**: feed `B_s2s = 0` and reset the running balance to 0 going forward.

**Effective-date convention:** a recalc takes effect **tomorrow**. `RD` = tomorrow → end (inclusive); the balance fed in is *after* today's spend. Today's grant is never rewritten.

**Precision:** stored amounts are integer cents. `Baseline = UR_cents / RD` is a rate — keep it as a `decimal.js` value at full precision; sum it across days for the balance replay; **round only at the display layer** (half-up to the cent). This is what lets Example 3 reconcile exactly.

### 5c. The unit-test suite = brief Section 5 (get these green FIRST)

| Test | Trigger | Expected Baseline / assertion |
|---|---|---|
| Ex 1 | Onboarding, walk-down as programs added | 164.38 → 115.07 → 93.70 → **83.8356** |
| Ex 2 | Normal day, rollover, no recalc | no recalc; Sep 2 available S2S = **161.68** |
| Ex 3 | $900 S2S overspend → recalc | **82.4271** |
| Ex 3-c1 | Same inputs **without** the flight | **83.8356** exactly (unchanged) |
| Ex 3-c2 | Deficit spread check | `500 / 355 = 1.4085`; `83.8356 − 1.4085 = 82.4271` |
| Ex 4 | Program (groceries) overspend $210 | 82.43 → **82.26**; banked S2S untouched |
| Ex 5 | One-time trip $800 (Nov 25) | 82.26 → **79.96**; UI shows the delta |
| Ex 6 | $30,000 trip → deficit | Baseline **−6.00/day**; `isDeficit = true` |
| Ex 7 | Spend a program surplus ($600 bucket, spend $550) | no recalc; **$50** surplus remains |

Ex 3's two consistency checks are the canary: if they don't pass to the cent, the double-counting rules are violated.

---

## 6. Build order (phased — do NOT build all epics at once)

Each phase has a **Definition of Done (DoD)**. Don't start the next until DoD is green. This is also the natural way to split work between two people.

### Phase 0 — Foundations *(no DB/auth needed)*
- Add Vitest, Luxon, decimal.js. Set up the design tokens & fonts (§8).
- **DoD:** `npm test` runs; app still boots; fonts/colors wired into Tailwind.

### Phase 1 — THE ENGINE ⭐ *(the gate)*
- Implement `occurrencesFor` + `computePlanState` as pure modules with no I/O.
- Encode Section 5 as the test suite.
- **DoD:** every test in §5c passes to the cent, including Ex 3 c1 & c2. *Nothing else proceeds until this is green.*

### Phase 2 — Thin end-to-end slice
- Clerk auth (sign up / log in). Prisma + Neon connected. Data-access layer, user-scoped.
- Onboarding (pool → start → end) → create Plan → land on Home showing the first S2S number.
- Create **one** Program Spend; log **one** Spend Entry; watch S2S update via the engine.
- Seed the **"Maria" demo user** so the app is explorable instantly.
- **DoD:** the full loop works against the real DB for a logged-in user; Maria's Home shows **$83.84**.

### Phase 3 — Program Spend management (Epic 3)
- Full create/edit/cancel/delete; recurring (weekly/biweekly/monthly + anchor) and one-time; buckets, surpluses, upcoming occurrences; visible Baseline delta on every change.
- **DoD:** Examples 4, 5, 7 reproducible through the UI.

### Phase 4 — Home polish, delta feedback, deficit state (Epics 4 partial, screen 3 & 10)
- Hero S2S numeral with the **count-up animation** on change. Upcoming-occurrences strip, days remaining. Deficit takeover with calm copy + CTAs (Example 6).
- Daily rollover job at the NY-time boundary (Route Handler + scheduled trigger).
- **DoD:** deficit renders friendly + actionable; number animates; rollover advances the day.

### Phase 5 — Plan settings, inflows, history (Epics 2 & screen 8, 9)
- Edit pool/dates, log inflows (recalc + delta), Activity/History list with per-entry edit/delete.
- **DoD:** editing anything recalculates correctly; history never auto-rewrites.

### Phase 6 — Spend-logging speed pass (Epic 5)
- Make **Log Spend** the fastest screen: amount keypad → S2S/Program toggle → save in **<5s, ≤3 taps**. Optimize this harder than anything else.
- **DoD:** logging a spend measured at ≤3 taps; S2S/Program choice is unmissable with one-line microcopy.

---

## 7. Screens → phases

Auth & Onboarding (P2) · Home/Today ⭐ (P2 then P4) · Log Spend (P2 then P6) · Program Spend list/add/edit/detail (P3) · Plan settings (P5) · Activity/History (P5) · Deficit takeover (P4). Mobile-first; usable on desktop.

---

## 8. Design system setup (do early, in Phase 0)

- **Fonts** via `next/font` (Google): **Montserrat** (600, 800) for headings/numerals, **Nunito Sans** (400, 700) for body. Expose as CSS variables.
- **Tailwind theme tokens** for the palette & semantic roles from brief §8. **Tabular figures everywhere money appears.**
- Enforce contrast rules: `#00C9B7` / `#00A6B5` are fills/large-display only (never body text on white); `#FF2654` large text/icons only; Ink & purple are text-safe. Target WCAG AA.

| Role | Token |
|---|---|
| Ink (text, S2S numeral) | `#003945` |
| Primary/interactive | `#5B21EE` ⚠️ placeholder — see §10 |
| Secondary accent | `#00A6B5` |
| Positive | `#00C9B7` |
| Alert (deficit only, rare) | `#FF2654` |
| Surface (bg) | `#ECF3F4` |
| Card | `#FFFFFF` |

---

## 9. Collaboration workflow (two builders, one repo)

To avoid overwriting each other:
- **Always `git pull` before starting and before pushing.** Order: pull → change → commit → push.
- Natural split: one person can own **Phase 1 (engine)** while the other sets up **Phase 0 tooling + Phase 2 auth/DB scaffolding** — they only meet at Phase 2.
- Prefer small, frequent commits with clear messages. If a conflict happens, Claude Code walks you through the merge; nothing is lost.
- **Verify Next 16 conventions from `node_modules/next/dist/docs/` before writing framework code** (the repo's own rule — Next 16 renamed/changed things vs. older versions).

---

## 10. Open decisions to confirm (need a human)

1. **Brand purple hex.** The brand sheet labels the App purple `#FF2654`, which is actually the coral *Alert* red — almost certainly a copy-paste error. I'm using **`#5B21EE`** as a placeholder for the primary/interactive color. **Please confirm the real purple with the team before we finalize the palette.**
2. **Stack sign-off.** I've committed to Postgres/Prisma + Clerk + Vercel per the brief's "your call." If you or a teammate has a strong preference (e.g. Supabase, a different auth), say so before Phase 2 — the engine (Phase 1) is unaffected either way.

---

## 11. Explicitly out of scope for v1 (from brief §10)

Over/underspend refinements beyond even-split · deficit smoothing curves · reconciliation tooling · bank/email/receipt import · what-if preview sandbox · per-user timezone · social/shared features · notifications/forecasting charts/export. *Flag if they come up; don't build.*

---

## Appendix A — Next.js 16 conventions (verified against the bundled docs)

Next 16 renamed/changed several things vs. the Next 14/15 patterns most tutorials show. These are the ones that affect us:

- **Mutations = Server Actions**, still the recommended pattern. `'use server'` directive; call from `<form action={fn}>` or from Client Components via `formAction`/handlers. Use React 19 `useActionState(action, initial)` for pending/error state. **Security: a Server Action is a public POST endpoint — re-verify auth *inside every one*.** After a mutation, `revalidatePath`/`revalidateTag` (now needs a 2nd arg, e.g. `revalidateTag('x','max')`) or the new `refresh()` from `next/cache`.
- **Async request APIs are now mandatory.** `await cookies()`, `await headers()`, and `params`/`searchParams` are Promises — must be `await`ed. Synchronous access (common in Next 14/15 code) is removed and will error. Codemod: `npx @next/codemod@canary next-async-request-api .`.
- **Middleware is renamed to `proxy.ts`** (root or `src/`), export `proxy`, same `config.matcher`. Node runtime only (no edge). Use it **only for optimistic cookie redirects, never for real auth or DB checks** — it runs on every request including prefetches.
- **Real auth lives in a Data Access Layer (DAL).** A `'server-only'` module with `verifySession()` wrapped in React `cache()`; check auth **close to the data** (in pages/leaf server components and inside every Server Action / Route Handler), **not in layouts** (layouts don't re-gate on navigation).
- **Caching: leave Cache Components OFF for v1** (simpler for an always-dynamic per-user app). Then force fresh rendering with route segment config `export const dynamic = 'force-dynamic'` (or `export const revalidate = 0`), and/or read `await cookies()` / call `connection()` from `next/server`. Do **not** add `'use cache'` to per-user data. (Cache Components / `'use cache'` / PPR are opt-in via `cacheComponents: true` — not needed here.)
- **Route Handlers** (`route.ts`, exported `GET`/`POST`) for the daily-rollover endpoint. Not cached by default; `ctx.params` and `cookies()`/`headers()` are async.
- **Fonts unchanged:** `import { Montserrat, Nunito_Sans } from 'next/font/google'`, instantiate at module scope, apply `.className`/CSS variable in the Root Layout.
- **Misc that bites:** parallel routes now require `default.js`; `next lint` removed (use ESLint CLI, already in scripts); Node 20.9+/TS 5.1+; Turbopack is the default.

> ⚠️ **Clerk + Next 16 integration check (do in Phase 2):** Clerk's Next SDK traditionally uses `middleware.ts` with `clerkMiddleware()`. Confirm Clerk supports Next 16's `proxy.ts` (or works via provider + DAL guards without middleware). If Clerk lags on Next 16, fall back to guarding in the DAL only, or switch to Auth.js — decide at Phase 2. The engine (Phase 1) is unaffected.
