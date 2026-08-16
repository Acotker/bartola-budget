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

export const DEMO_EMAIL = "maria@demo.bartola";

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

export async function loadActivePlan(): Promise<LoadedPlan | null> {
  const plan = await prisma.plan.findFirst({
    where: { user: { email: DEMO_EMAIL } },
    include: { programs: true, spends: true, adjustments: true },
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

export async function getHomeView(): Promise<HomeView | null> {
  const loaded = await loadActivePlan();
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
