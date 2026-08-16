import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { APP_ASOF } from "./data";
import {
  occurrencesFor,
  addDays,
  type EnginePlan,
  type EngineProgramSpend,
} from "@/engine";

/**
 * Realistic demo personas, seeded into the live database so the app can be
 * demoed/tested mid-journey. Deterministic (no randomness) so re-seeding
 * reproduces the exact same scenario — i.e. this doubles as a "reset demo".
 * Only touches these demo emails; real accounts are never affected.
 */

export const DEMO_PASSWORD = "demo1234";

type Freq = "daily" | "weekly" | "biweekly" | "monthly";

interface RecurringCfg {
  name: string;
  freq: Freq;
  anchorDay?: number;
  anchorWeekday?: number;
  amountCents: number;
  /** Fraction of budget actually spent on each past occurrence (0 = untouched, leaves surplus). */
  spentRatio: number;
}

interface OneTimeCfg {
  name: string;
  targetDate: string;
  amountCents: number;
}

interface InflowCfg {
  date: string;
  amountCents: number;
  note: string;
}

/** One day's worth of discretionary line items, e.g. [{note:"Coffee",amountCents:500}]. */
type DaySpend = { note: string; amountCents: number }[];

interface Persona {
  email: string;
  poolCents: number;
  startDate: string;
  endDate: string;
  recurring: RecurringCfg[];
  oneTime: OneTimeCfg[];
  inflows: InflowCfg[];
  /**
   * Past daily Safe-to-Spend history. Either the simple pattern (coffee every
   * day, lunch every 3rd day, outing weekly) or a full Mon..Sun template
   * (`weekTemplate`, 7 entries, cycled) for a richer, denser story. Exactly
   * one of the two shapes is set per persona.
   */
  coffeeCents?: number;
  lunchCents?: number;
  outingCents?: number;
  weekTemplate?: DaySpend[];
}

/** Multiply a Mon..Sun template's amounts by a factor (used to hit a target weekly spend). */
function scaleWeek(template: DaySpend[], factor: number): DaySpend[] {
  return template.map((day) =>
    day.map((item) => ({ ...item, amountCents: Math.round(item.amountCents * factor) })),
  );
}

// A believable week: coffee/lunch on weekdays, a Friday dinner, a bigger
// Saturday, a quiet Sunday. Scaled per persona to land a moderate S2S
// carryover — realistic daily spending close to (not far under) the daily sip.
const REALISTIC_WEEK: DaySpend[] = [
  [{ note: "Coffee", amountCents: 500 }, { note: "Lunch", amountCents: 1400 }], // Mon
  [{ note: "Coffee", amountCents: 500 }, { note: "Lunch", amountCents: 1400 }], // Tue
  [{ note: "Coffee", amountCents: 500 }], // Wed
  [{ note: "Coffee", amountCents: 500 }, { note: "Lunch", amountCents: 1400 }], // Thu
  [{ note: "Coffee", amountCents: 500 }, { note: "Dinner with friends", amountCents: 2800 }], // Fri
  [{ note: "Brunch", amountCents: 1800 }, { note: "Weekend outing", amountCents: 4200 }], // Sat
  [{ note: "Coffee", amountCents: 500 }, { note: "Misc", amountCents: 1200 }], // Sun
];

const PERSONAS: Persona[] = [
  {
    email: "demo1@bartola.app",
    poolCents: 9_500_000,
    startDate: "2026-08-01",
    endDate: "2028-06-30",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 160_000, spentRatio: 1 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 6, amountCents: 16_000, spentRatio: 0.9 },
      { name: "Phone & utilities", freq: "monthly", anchorDay: 15, amountCents: 9_000, spentRatio: 1 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 25_000, spentRatio: 0 },
    ],
    oneTime: [
      { name: "Winter holidays trip", targetDate: "2026-12-22", amountCents: 140_000 },
      { name: "Summer in Europe", targetDate: "2027-07-10", amountCents: 280_000 },
      { name: "Spring break", targetDate: "2028-03-15", amountCents: 120_000 },
    ],
    inflows: [{ date: "2026-09-01", amountCents: 200_000, note: "TA stipend" }],
    coffeeCents: 475,
    lunchCents: 1_400,
    outingCents: 3_500,
  },
  {
    email: "demo2@bartola.app",
    poolCents: 6_200_000,
    startDate: "2026-08-01",
    endDate: "2028-05-31",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 120_000, spentRatio: 1 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 7, amountCents: 12_000, spentRatio: 0.95 },
      { name: "Gym", freq: "monthly", anchorDay: 5, amountCents: 4_500, spentRatio: 1 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 15_000, spentRatio: 0 },
    ],
    oneTime: [
      { name: "Thanksgiving home", targetDate: "2026-11-25", amountCents: 55_000 },
      { name: "Summer roadtrip", targetDate: "2027-06-20", amountCents: 150_000 },
    ],
    inflows: [{ date: "2026-08-20", amountCents: 90_000, note: "Birthday gift" }],
    coffeeCents: 350,
    lunchCents: 1_100,
    outingCents: 2_500,
  },
  {
    email: "demo3@bartola.app",
    poolCents: 13_500_000,
    startDate: "2026-08-01",
    endDate: "2028-06-30",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 220_000, spentRatio: 1 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 6, amountCents: 20_000, spentRatio: 0.9 },
      { name: "Subscriptions", freq: "monthly", anchorDay: 10, amountCents: 8_000, spentRatio: 1 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 40_000, spentRatio: 0 },
    ],
    oneTime: [
      { name: "December trip home", targetDate: "2026-12-18", amountCents: 250_000 },
      { name: "Summer in Asia", targetDate: "2027-07-05", amountCents: 400_000 },
      { name: "Conference", targetDate: "2028-02-20", amountCents: 180_000 },
    ],
    inflows: [{ date: "2026-08-25", amountCents: 500_000, note: "Consulting project" }],
    coffeeCents: 550,
    lunchCents: 1_800,
    outingCents: 4_500,
  },

  // --- Duplicates of the two richest scenarios, for parallel demos/testing
  // without teammates colliding on the same account. Identical setup to
  // demo1 / demo3, different login. ---
  {
    email: "demo4@bartola.app",
    poolCents: 9_500_000,
    startDate: "2026-08-01",
    endDate: "2028-06-30",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 160_000, spentRatio: 1 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 6, amountCents: 16_000, spentRatio: 0.9 },
      { name: "Phone & utilities", freq: "monthly", anchorDay: 15, amountCents: 9_000, spentRatio: 1 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 25_000, spentRatio: 0 },
    ],
    oneTime: [
      { name: "Winter holidays trip", targetDate: "2026-12-22", amountCents: 140_000 },
      { name: "Summer in Europe", targetDate: "2027-07-10", amountCents: 280_000 },
      { name: "Spring break", targetDate: "2028-03-15", amountCents: 120_000 },
    ],
    inflows: [{ date: "2026-09-01", amountCents: 200_000, note: "TA stipend" }],
    coffeeCents: 475,
    lunchCents: 1_400,
    outingCents: 3_500,
  },
  {
    email: "demo5@bartola.app",
    poolCents: 13_500_000,
    startDate: "2026-08-01",
    endDate: "2028-06-30",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 220_000, spentRatio: 1 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 6, amountCents: 20_000, spentRatio: 0.9 },
      { name: "Subscriptions", freq: "monthly", anchorDay: 10, amountCents: 8_000, spentRatio: 1 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 40_000, spentRatio: 0 },
    ],
    oneTime: [
      { name: "December trip home", targetDate: "2026-12-18", amountCents: 250_000 },
      { name: "Summer in Asia", targetDate: "2027-07-05", amountCents: 400_000 },
      { name: "Conference", targetDate: "2028-02-20", amountCents: 180_000 },
    ],
    inflows: [{ date: "2026-08-25", amountCents: 500_000, note: "Consulting project" }],
    coffeeCents: 550,
    lunchCents: 1_800,
    outingCents: 4_500,
  },

  // --- The "ultimate demo" three: each built around one flagship moment. ---
  {
    // Story: rent posted on the 1st but not yet logged — it shows up in
    // "Ready to sip" as real, unspent money sitting there, exactly the
    // behavior the product is proud of. Plus a partially-spent groceries and
    // trips bucket, and a moderate (not massive) carried-over Safe-to-Spend.
    email: "demo6@bartola.app",
    poolCents: 8_000_000,
    startDate: "2026-08-14",
    endDate: "2028-06-30",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 145_000, spentRatio: 0 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 6, amountCents: 14_000, spentRatio: 0.8 },
      { name: "Phone & utilities", freq: "monthly", anchorDay: 15, amountCents: 6_000, spentRatio: 1 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 20_000, spentRatio: 0.4 },
    ],
    oneTime: [
      { name: "Winter break", targetDate: "2026-12-20", amountCents: 90_000 },
      { name: "Summer abroad", targetDate: "2027-07-01", amountCents: 220_000 },
    ],
    inflows: [{ date: "2026-08-20", amountCents: 150_000, note: "Fellowship top-up" }],
    weekTemplate: scaleWeek(REALISTIC_WEEK, 1.45),
  },
  {
    // Story: a thin Safe-to-Spend buffer, perfect for demoing a *live*
    // overspend — type an amount above the balance shown and watch the
    // consequence line explain the recalculation in real time.
    email: "demo7@bartola.app",
    poolCents: 7_200_000,
    startDate: "2026-08-24",
    endDate: "2028-05-31",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 130_000, spentRatio: 1 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 7, amountCents: 13_000, spentRatio: 0.9 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 15_000, spentRatio: 0.6 },
    ],
    oneTime: [{ name: "Thanksgiving", targetDate: "2026-11-26", amountCents: 45_000 }],
    inflows: [{ date: "2026-08-26", amountCents: 60_000, note: "Freelance gig" }],
    weekTemplate: scaleWeek(REALISTIC_WEEK, 2.15),
  },
  {
    // Story: comfortable headroom, built so adding a big trip live visibly
    // eats into (or flips) the plan — great for showing the Baseline-delta
    // preview and, if you go big enough, the friendly deficit state.
    email: "demo8@bartola.app",
    poolCents: 10_500_000,
    startDate: "2026-08-10",
    endDate: "2028-06-30",
    recurring: [
      { name: "Rent", freq: "monthly", anchorDay: 1, amountCents: 170_000, spentRatio: 1 },
      { name: "Groceries", freq: "weekly", anchorWeekday: 6, amountCents: 17_000, spentRatio: 0.85 },
      { name: "Subscriptions", freq: "monthly", anchorDay: 10, amountCents: 5_000, spentRatio: 1 },
      { name: "Trips fund", freq: "monthly", anchorDay: 1, amountCents: 25_000, spentRatio: 0.3 },
    ],
    oneTime: [
      { name: "December trip", targetDate: "2026-12-19", amountCents: 130_000 },
      { name: "Summer trip", targetDate: "2027-07-08", amountCents: 260_000 },
    ],
    inflows: [{ date: "2026-08-16", amountCents: 300_000, note: "Research assistantship" }],
    weekTemplate: scaleWeek(REALISTIC_WEEK, 2.4),
  },
];

function toEngineProgram(r: RecurringCfg): EngineProgramSpend {
  return {
    id: "tmp",
    name: r.name,
    isRecurring: true,
    amountPerOccurrenceCents: r.amountCents,
    recurrence: { freq: r.freq, anchorDay: r.anchorDay, anchorWeekday: r.anchorWeekday },
  };
}

export interface SeedSummary {
  users: { email: string; password: string; pastEntries: number }[];
}

export async function seedDemoData(): Promise<SeedSummary> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users: SeedSummary["users"] = [];

  for (const p of PERSONAS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: { passwordHash },
      create: { email: p.email, passwordHash },
    });

    // Idempotent reset: wipe this demo user's plan(s) and rebuild.
    await prisma.plan.deleteMany({ where: { userId: user.id } });

    const plan = await prisma.plan.create({
      data: {
        userId: user.id,
        poolAmountCents: p.poolCents,
        startDate: p.startDate,
        endDate: p.endDate,
      },
    });

    const enginePlan: EnginePlan = {
      poolCents: p.poolCents,
      startDate: p.startDate,
      endDate: p.endDate,
    };
    const spends: Prisma.SpendEntryCreateManyInput[] = [];

    // Recurring Program Spends (set up at onboarding) + their past-occurrence spends.
    for (const r of p.recurring) {
      const prog = await prisma.programSpend.create({
        data: {
          planId: plan.id,
          name: r.name,
          isRecurring: true,
          freq: r.freq,
          anchorDay: r.anchorDay ?? null,
          anchorWeekday: r.anchorWeekday ?? null,
          amountPerOccurrenceCents: r.amountCents,
          addedOn: p.startDate,
          status: "active",
        },
      });
      if (r.spentRatio > 0) {
        const pastOccurrences = occurrencesFor(toEngineProgram(r), enginePlan).filter(
          (d) => d < APP_ASOF,
        );
        for (const date of pastOccurrences) {
          spends.push({
            planId: plan.id,
            date,
            amountCents: Math.round(r.amountCents * r.spentRatio),
            type: "program",
            programSpendId: prog.id,
          });
        }
      }
    }

    // One-time trips (future).
    for (const o of p.oneTime) {
      await prisma.programSpend.create({
        data: {
          planId: plan.id,
          name: o.name,
          isRecurring: false,
          amountPerOccurrenceCents: o.amountCents,
          targetDate: o.targetDate,
          addedOn: p.startDate,
          status: "active",
        },
      });
    }

    // Extra income already logged.
    for (const inf of p.inflows) {
      await prisma.planAdjustment.create({
        data: {
          planId: plan.id,
          type: "income_add",
          amountCents: inf.amountCents,
          date: inf.date,
          note: inf.note,
        },
      });
    }

    // Past daily Safe-to-Spend history (deterministic).
    let day = p.startDate;
    let i = 0;
    while (day < APP_ASOF) {
      if (p.weekTemplate) {
        for (const item of p.weekTemplate[i % 7]) {
          spends.push({ planId: plan.id, date: day, amountCents: item.amountCents, type: "s2s", note: item.note });
        }
      } else {
        spends.push({ planId: plan.id, date: day, amountCents: p.coffeeCents!, type: "s2s", note: "Coffee" });
        if (i % 3 === 0) {
          spends.push({ planId: plan.id, date: day, amountCents: p.lunchCents!, type: "s2s", note: "Lunch" });
        }
        if (i % 7 === 5) {
          spends.push({ planId: plan.id, date: day, amountCents: p.outingCents!, type: "s2s", note: "Weekend out" });
        }
      }
      day = addDays(day, 1);
      i += 1;
    }

    await prisma.spendEntry.createMany({ data: spends });
    users.push({ email: p.email, password: DEMO_PASSWORD, pastEntries: spends.length });
  }

  return { users };
}
