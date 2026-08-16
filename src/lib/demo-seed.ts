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

interface Persona {
  email: string;
  poolCents: number;
  startDate: string;
  endDate: string;
  recurring: RecurringCfg[];
  oneTime: OneTimeCfg[];
  inflows: InflowCfg[];
  /** Daily Safe-to-Spend history amounts (deterministic pattern). */
  coffeeCents: number;
  lunchCents: number;
  outingCents: number;
}

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

    // Past daily Safe-to-Spend history (deterministic pattern).
    let day = p.startDate;
    let i = 0;
    while (day < APP_ASOF) {
      spends.push({ planId: plan.id, date: day, amountCents: p.coffeeCents, type: "s2s", note: "Coffee" });
      if (i % 3 === 0) {
        spends.push({ planId: plan.id, date: day, amountCents: p.lunchCents, type: "s2s", note: "Lunch" });
      }
      if (i % 7 === 5) {
        spends.push({ planId: plan.id, date: day, amountCents: p.outingCents, type: "s2s", note: "Weekend out" });
      }
      day = addDays(day, 1);
      i += 1;
    }

    await prisma.spendEntry.createMany({ data: spends });
    users.push({ email: p.email, password: DEMO_PASSWORD, pastEntries: spends.length });
  }

  return { users };
}
