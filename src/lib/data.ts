import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {
  computePlanState,
  occurrencesFor,
  daysInclusive,
  type EngineInput,
  type EngineProgramSpend,
  type EngineSpendEntry,
  type PlanState,
  type ProgramStatus,
  type RecurrenceFreq,
} from "@/engine";

/**
 * Demo clock. The seeded plan runs Sep 2026 -> Aug 2027, so we anchor "today"
 * inside the runway. In a production build this becomes the current date in
 * America/New_York.
 */
export const APP_ASOF = "2026-09-10";

type PlanWithRelations = Prisma.PlanGetPayload<{
  include: { programs: true; spends: true; adjustments: true };
}>;

const planInclude = {
  programs: true,
  spends: true,
  adjustments: true,
} as const;

/** Pure mapping from a persisted plan to the engine's input shape. */
export function planToEngineInput(plan: PlanWithRelations): EngineInput {
  const programs: EngineProgramSpend[] = plan.programs.map((p) => ({
    id: p.id,
    name: p.name,
    isRecurring: p.isRecurring,
    amountPerOccurrenceCents: p.amountPerOccurrenceCents,
    recurrence:
      p.isRecurring && p.freq
        ? { freq: p.freq as RecurrenceFreq, anchorDay: p.anchorDay ?? undefined }
        : undefined,
    startDate: p.startDate ?? undefined,
    endDate: p.endDate ?? undefined,
    targetDate: p.targetDate ?? undefined,
    addedOn: p.addedOn ?? undefined,
    status: p.status as ProgramStatus,
    cancelledOn: p.cancelledOn ?? undefined,
  }));

  const spends: EngineSpendEntry[] = plan.spends.map((s) => ({
    id: s.id,
    date: s.date,
    amountCents: s.amountCents,
    type: s.type === "program" ? "program" : "s2s",
    programSpendId: s.programSpendId ?? undefined,
    occurrenceRef: s.occurrenceRef ?? undefined,
    note: s.note ?? undefined,
  }));

  const inflows = plan.adjustments
    .filter((a) => a.type === "income_add")
    .map((a) => ({ date: a.date, amountCents: a.amountCents }));

  return {
    plan: {
      poolCents: plan.poolAmountCents,
      startDate: plan.startDate,
      endDate: plan.endDate,
    },
    programs,
    spends,
    inflows,
  };
}

async function findActivePlan(userId: string): Promise<PlanWithRelations | null> {
  return prisma.plan.findFirst({
    where: { userId },
    include: planInclude,
    orderBy: { createdAt: "desc" },
  });
}

interface LoadedPlan {
  planId: string;
  input: EngineInput;
  programs: { id: string; name: string }[];
}

export async function loadActivePlan(userId: string): Promise<LoadedPlan | null> {
  const plan = await findActivePlan(userId);
  if (!plan) return null;
  const input = planToEngineInput(plan);
  return {
    planId: plan.id,
    input,
    programs: input.programs
      .filter((p) => p.status !== "cancelled")
      .map((p) => ({ id: p.id, name: p.name })),
  };
}

export interface HomeView {
  planId: string;
  input: EngineInput;
  state: PlanState;
  asOf: string;
  daysRemaining: number;
  upcoming: { date: string; name: string; amountCents: number }[];
  programs: { id: string; name: string }[];
}

export async function getHomeView(userId: string): Promise<HomeView | null> {
  const loaded = await loadActivePlan(userId);
  if (!loaded) return null;

  const state = computePlanState(loaded.input, APP_ASOF);
  const daysRemaining = daysInclusive(APP_ASOF, loaded.input.plan.endDate);
  const upcoming = loaded.input.programs
    .flatMap((p) =>
      occurrencesFor(p, loaded.input.plan)
        .filter((d) => d > APP_ASOF)
        .map((d) => ({
          date: d,
          name: p.name,
          amountCents: p.amountPerOccurrenceCents,
        })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 5);

  return {
    planId: loaded.planId,
    input: loaded.input,
    state,
    asOf: APP_ASOF,
    daysRemaining,
    upcoming,
    programs: loaded.programs,
  };
}

export interface ProgramCard {
  id: string;
  name: string;
  reservedTotalCents: number;
  spentCents: number;
  balanceCents: number;
  nextOccurrence: string | null;
}

export async function getProgramsView(
  userId: string,
): Promise<{ cards: ProgramCard[]; asOf: string } | null> {
  const loaded = await loadActivePlan(userId);
  if (!loaded) return null;

  const state = computePlanState(loaded.input, APP_ASOF);
  const bucketByProgram = new Map(
    state.buckets.map((b) => [b.programSpendId, b]),
  );

  const cards: ProgramCard[] = loaded.input.programs
    .filter((p) => p.status !== "cancelled")
    .map((p) => {
      const occs = occurrencesFor(p, loaded.input.plan);
      const reservedTotalCents = occs.length * p.amountPerOccurrenceCents;
      const spentCents = loaded.input.spends
        .filter((s) => s.type === "program" && s.programSpendId === p.id)
        .reduce((sum, s) => sum + s.amountCents, 0);
      return {
        id: p.id,
        name: p.name,
        reservedTotalCents,
        spentCents,
        balanceCents: bucketByProgram.get(p.id)?.balanceCents ?? 0,
        nextOccurrence: occs.find((d) => d > APP_ASOF) ?? null,
      };
    });

  return { cards, asOf: APP_ASOF };
}

export interface HistoryEntry {
  id: string;
  date: string;
  amountCents: number;
  type: string;
  label: string;
  note: string | null;
}

export async function getHistory(
  userId: string,
): Promise<{ entries: HistoryEntry[] } | null> {
  const loaded = await loadActivePlan(userId);
  if (!loaded) return null;

  const nameById = new Map(loaded.input.programs.map((p) => [p.id, p.name]));
  const entries: HistoryEntry[] = [...loaded.input.spends]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((s) => ({
      id: s.id,
      date: s.date,
      amountCents: s.amountCents,
      type: s.type,
      label:
        s.type === "program"
          ? nameById.get(s.programSpendId ?? "") ?? "Budget"
          : "Safe-to-Spend",
      note: s.note ?? null,
    }));

  return { entries };
}

export interface SettingsView {
  planId: string;
  poolCents: number;
  startDate: string;
  endDate: string;
  reservedCents: number;
  unallocatedCents: number;
  daysRemaining: number;
  dailyCents: number;
  isDeficit: boolean;
  income: { date: string; amountCents: number; note: string | null }[];
}

export async function getSettingsView(
  userId: string,
): Promise<SettingsView | null> {
  const plan = await findActivePlan(userId);
  if (!plan) return null;
  const input = planToEngineInput(plan);
  const state = computePlanState(input, APP_ASOF);

  const reservedCents = input.programs
    .filter((p) => p.status !== "cancelled")
    .reduce(
      (sum, p) =>
        sum + occurrencesFor(p, input.plan).length * p.amountPerOccurrenceCents,
      0,
    );
  const totalInflows = (input.inflows ?? []).reduce(
    (s, i) => s + i.amountCents,
    0,
  );

  return {
    planId: plan.id,
    poolCents: plan.poolAmountCents,
    startDate: plan.startDate,
    endDate: plan.endDate,
    reservedCents,
    unallocatedCents: plan.poolAmountCents + totalInflows - reservedCents,
    daysRemaining: daysInclusive(APP_ASOF, input.plan.endDate),
    dailyCents: state.baselineCents,
    isDeficit: state.isDeficit,
    income: plan.adjustments
      .filter((a) => a.type === "income_add")
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((a) => ({ date: a.date, amountCents: a.amountCents, note: a.note })),
  };
}

export interface ProgramDetail {
  planId: string;
  program: EngineProgramSpend;
  balanceCents: number;
  reservedTotalCents: number;
  spentCents: number;
  occurrences: string[];
  spends: { id: string; date: string; amountCents: number; note: string | null }[];
  asOf: string;
}

export async function getProgramDetail(
  userId: string,
  programId: string,
): Promise<ProgramDetail | null> {
  const plan = await findActivePlan(userId);
  if (!plan) return null;
  const input = planToEngineInput(plan);
  const program = input.programs.find((p) => p.id === programId);
  if (!program) return null;

  const state = computePlanState(input, APP_ASOF);
  const bucket = state.buckets.find((b) => b.programSpendId === programId);
  const occurrences = occurrencesFor(program, input.plan);
  const spends = input.spends
    .filter((s) => s.type === "program" && s.programSpendId === programId)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((s) => ({
      id: s.id,
      date: s.date,
      amountCents: s.amountCents,
      note: s.note ?? null,
    }));

  return {
    planId: plan.id,
    program,
    balanceCents: bucket?.balanceCents ?? 0,
    reservedTotalCents: occurrences.length * program.amountPerOccurrenceCents,
    spentCents: spends.reduce((sum, s) => sum + s.amountCents, 0),
    occurrences,
    spends,
    asOf: APP_ASOF,
  };
}

/** Recompute every plan's current state — the shape a daily cron would run. */
export async function runDailyRollover(): Promise<{
  processed: number;
  deficits: number;
}> {
  const plans = await prisma.plan.findMany({ include: planInclude });
  let deficits = 0;
  for (const plan of plans) {
    const state = computePlanState(planToEngineInput(plan), APP_ASOF);
    if (state.isDeficit) deficits += 1;
  }
  return { processed: plans.length, deficits };
}
