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

interface LoadedPlan {
  planId: string;
  input: EngineInput;
  programs: { id: string; name: string }[];
}

/** Load a specific user's active plan. Always scoped by userId (data isolation). */
export async function loadActivePlan(userId: string): Promise<LoadedPlan | null> {
  const plan = await prisma.plan.findFirst({
    where: { userId },
    include: { programs: true, spends: true, adjustments: true },
    orderBy: { createdAt: "desc" },
  });
  if (!plan) return null;

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

  const input: EngineInput = {
    plan: {
      poolCents: plan.poolAmountCents,
      startDate: plan.startDate,
      endDate: plan.endDate,
    },
    programs,
    spends,
    inflows,
  };

  return {
    planId: plan.id,
    input,
    programs: programs
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
