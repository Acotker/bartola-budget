# Sip — Feature Summary

*A daily-decision budgeting app for people living off a fixed pool of money for a fixed stretch of time (grad students, sabbaticals, gap years). Live at **sip-budget.vercel.app** and **bartola-budget-yzlp.vercel.app** (same app, two URLs).*

---

## 1. The core idea

Most budgeting apps tell you what you *did*. Sip tells you what you *can do today*. Every obligation you know about — rent, groceries, trips — is set aside up front; whatever's genuinely free becomes **Safe to Spend**, a single number that accumulates when you underspend and eases gently when you overspend. The product's whole job is answering one question: *"Can I afford this, right now?"*

---

## 2. The engine — the part that has to be exactly right

A pure, isolated, unit-tested module (`src/engine/`) that takes a Plan, its Program Spends, and every logged transaction, and returns the current daily allowance and every bucket's balance. No UI or database code touches this math directly.

**What it guarantees:**
- All money is stored and computed in **integer cents** — no floating-point drift.
- **Recurring obligations reserve their full projected cost upfront** (rent at $1,500/month with 12 months left reserves $18,000 immediately), so the daily number is honest from day one.
- **Underspending never triggers anything** — surplus just sits in its bucket, still spendable there.
- **Overspending triggers a forward-only recalculation** — the overage is absorbed and spread evenly across the days you have left. Past days are never rewritten.
- **Banked balances are protected** — money already saved is subtracted out of the pool before the daily number is recomputed, so you can never accidentally spend the same dollar twice.
- Recognizes five recurrence shapes: **daily, weekly, every-two-weeks, monthly** (with a chosen day, weekday, or day-of-month), and **one-time** — all unified behind one "how often?" question.
- **22 automated tests** reproduce the product spec's worked examples to the exact cent, including the trickiest case (an overspend mid-month) checked two different ways for consistency.

---

## 3. Accounts & your plan

- **Real email/password accounts** — signup, login, logout. Passwords are hashed; sessions are signed, HttpOnly cookies.
- **Full data isolation** — every plan, spend, and setting is scoped to the logged-in user.
- **Onboarding**: three inputs (pool amount, start date, end date) and you land on your first Safe-to-Spend number — no forced setup of obligations first.
- **Plan settings screen**: edit your total pool, start date, or end date anytime; every edit shows the new daily number immediately. Log extra income (a stipend, gift, loan) that grows your pool from that day forward.

---

## 4. Program Spends — the money you've already set aside

"Program Spend" is the app's name for any obligation or goal you carve out of your pool — rent, groceries, a trip. Never called a "budget."

- **Create one** through a step-by-step form: name → amount → **how often?** (daily / weekly / every 2 weeks / monthly / one-time) → only the fields that question needs (a weekday picker, a day-of-month picker, or a target date) → a plain-language summary of the rule as you build it (*"$150 every Monday, Sep 1 2026 → Aug 31 2027"*) → a preview of the next few dates → and the exact daily-number impact **before you even save** (*"Your daily goes from $82.26 to $79.96"*).
- **Independent start/end dates per Program Spend** — a lease ending in June stops reserving money in July, regardless of what the overall plan's end date is.
- **Editing never rewrites history.** Change an amount, the recurrence, or the dates, and the change applies **tomorrow onward only** — every past month, and anything you already logged, stays exactly as it was. (Under the hood: an edit closes out the old record and links a new one, rather than mutating the original — so "what was rent in October?" always has a real, correct answer.)
- **End it from a chosen date forward** — keeps everything before that date, drops everything after, without deleting the history.
- **The Program Spends list**: every active one, showing what's reserved, what's spent, what's left — ordered by soonest-due — with a one-tap "add a Program Spend" and per-item detail/edit/end.

---

## 5. Logging a spend ("sipping it")

The single most-used interaction, optimized to be fast:

- A big keypad, then a choice: **Safe to Spend** or **a specific Program Spend** (pre-selected automatically if you tapped in from a Ready-to-sip card).
- A **live one-line consequence** as you type — your new balance, or if you're about to go over, the exact effect: *"$12.34 over Safe-to-Spend. Tomorrow's daily eases $83.84 → $82.10 to catch up."* Going over is never hidden behind a falsely reassuring $0.00.
- **Every logged spend is editable or deletable** afterward (amount, note, or remove entirely) — a correction, not a rewrite of history elsewhere.

---

## 6. Home — the screen people actually open every day

Organized around one question: *what can I spend right now?*

1. **Hero** — the Safe-to-Spend number, large, with a brief animated count-up whenever it changes; your daily allowance; what you've spent today; what carried over from yesterday.
2. **Sip it** — the always-visible, thumb-reachable primary button to log a spend.
3. **Ready to sip** — Program Spend buckets that currently have unspent money available *right now* (their due date has arrived and there's still balance) — shown as cards with a liquid fill-level bar, a direct "Sip it" button (pre-targeted, no re-picking), and a "Details" link. This intentionally surfaces things you haven't logged yet too — like rent that posted on the 1st but hasn't been marked paid.
4. **Spent today** — every transaction logged today, editable in one tap, sitting right below Ready-to-sip.
5. **Coming up** — the next few upcoming due dates, with a link to the full, date-ordered list.
6. Quick-access tiles to Program Spends, Activity, and Plan settings.
7. A calm, plain-language **deficit banner** if the plan stops adding up — never a blocked or scolding state, always with concrete next steps (trim a Program Spend, extend the date, add income).

---

## 7. Activity history

A chronological log of every spend, labeled by where it came from (Safe to Spend or a specific Program Spend), so you can always answer "what did I actually spend this week?"

---

## 8. The "Sip" brand

- Product name **Sip**, tagline *"Sip, don't gulp."* — the metaphor: a finite glass of money you're meant to enjoy deliberately, not gulp down.
- The core financial terms (**Safe to Spend**, **Program Spend**) are unchanged in the code and data model — brand language is a layer on top, in copy only (*"your daily sip," "Sipped $40," "Ready to sip"*).
- **Voice rule, deliberately enforced**: personality is playful on neutral/positive moments, and turns plain and calm the moment real money or a decision is at stake — the deficit state reads *"This plan doesn't add up yet,"* never a pun.
- Visual language leans into the metaphor honestly: remaining balances shown as **fill levels**, not generic progress bars; a warm, restrained palette (cream "glass," a confident green "liquid," a rare alert red); tabular figures everywhere money appears so digits don't jitter when they update.

---

## 9. Automation & infrastructure

- **Daily rollover job**, scheduled via Vercel Cron (5am UTC), recomputes every plan's state at the day boundary — the mechanism that lets Safe-to-Spend accrue and carry over automatically, day after day, with no user action required.
- **PostgreSQL (Neon)** for real, persistent, multi-user storage; schema changes applied safely via a direct (non-pooled) connection so deploys never silently fail to migrate.
- **CI-equivalent gate on every change**: the full engine test suite, lint, and a production build must all pass before anything merges — enforced by hand on every pull request throughout this build.
- **Demo/test data**: eight seeded demo accounts (`demo1`–`demo8@bartola.app`, password `demo1234`) covering a range of realistic, mid-journey scenarios — including three purpose-built to showcase specific flagship moments (an unpaid-but-surfaced obligation, a live overspend, and a live "add a big trip and watch the number react" moment). The seed is idempotent, so re-running it resets the demo accounts to a clean, repeatable state on demand.

---

## 10. Team workflow

Two people (and their own Claude Code sessions) build on this repo in parallel: `main` is always the deployable version; all work happens on a branch and comes back through a reviewed pull request, which Vercel automatically gives its own live preview link — so a UI change or a new feature can be seen and approved before it ever reaches production.

---

*Not yet built (known, deliberately out of scope for this stage): bank-account or receipt import, notifications, spending forecasts/charts, multi-user shared plans, and a "what-if" preview mode before committing a Program Spend.*
