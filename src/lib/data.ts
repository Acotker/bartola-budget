import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {
  computePlanState,
  snapshotAt,
  occurrencesFor,
  daysInclusive,
  addDays,
  projectCash,
  type Certainty,
  type EngineInput,
  type EngineProgramSpend,
  type EngineSpendEntry,
  type PlanState,
  type ProgramStatus,
  type RecurrenceFreq,
  type TrancheStatus,
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

type MemberWithHoldings = Prisma.MemberGetPayload<{
  include: { assets: true; tranches: true };
}>;

const planInclude = {
  programs: true,
  spends: true,
  adjustments: true,
} as const;

/**
 * Pure mapping from a persisted plan to the engine's input shape. When the user
 * has been migrated to the composed-pool model (a Member with assets/tranches),
 * the pool comes from those rows and the legacy scalar pool + income adjustments
 * are dropped, so nothing is double-counted. Otherwise the legacy path runs
 * unchanged.
 */
export function planToEngineInput(
  plan: PlanWithRelations,
  member?: MemberWithHoldings | null,
): EngineInput {
  const programs: EngineProgramSpend[] = plan.programs.map((p) => ({
    id: p.id,
    name: p.name,
    isRecurring: p.isRecurring,
    amountPerOccurrenceCents: p.amountPerOccurrenceCents,
    recurrence:
      p.isRecurring && p.freq
        ? {
            freq: p.freq as RecurrenceFreq,
            anchorDay: p.anchorDay ?? undefined,
            anchorWeekday: p.anchorWeekday ?? undefined,
          }
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

  // Migrated (composed-pool) plan: read spendable assets, tranches, and the
  // buffer from the member; seed the legacy scalar to 0 and skip income
  // adjustments (they're now tranches).
  if (member && (member.assets.length > 0 || member.tranches.length > 0)) {
    return {
      plan: { poolCents: 0, startDate: plan.startDate, endDate: plan.endDate },
      programs,
      spends,
      bufferCents: member.bufferCents,
      assets: member.assets.map((a) => ({
        balanceCents: a.balanceCents,
        spendable: a.spendable,
      })),
      tranches: member.tranches.map((t) => ({
        id: t.id,
        grossCents: t.grossCents,
        feesCents: t.feesCents,
        passthroughCents: t.passthroughCents,
        date: t.expectedDate,
        certainty: t.certainty as Certainty,
        status: t.status as TrancheStatus,
      })),
    };
  }

  // Legacy path: scalar pool + date-gated income adjustments.
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

/** The user's member row (v1: one per user), with its assets and tranches. Null
 *  until the plan is migrated to the composed-pool model. */
async function findMember(
  userId: string,
): Promise<MemberWithHoldings | null> {
  return prisma.member.findFirst({
    where: { userId },
    include: { assets: true, tranches: true },
    orderBy: { createdAt: "asc" },
  });
}

interface PlanContext {
  plan: PlanWithRelations;
  member: MemberWithHoldings | null;
  input: EngineInput;
}

/** Load the active plan, the member, and the composed engine input together, so
 *  every view computes the same (migrated or legacy) number. */
async function loadPlanContext(userId: string): Promise<PlanContext | null> {
  const plan = await findActivePlan(userId);
  if (!plan) return null;
  const member = await findMember(userId);
  return { plan, member, input: planToEngineInput(plan, member) };
}

interface LoadedPlan {
  planId: string;
  input: EngineInput;
  programs: { id: string; name: string }[];
}

export async function loadActivePlan(userId: string): Promise<LoadedPlan | null> {
  const ctx = await loadPlanContext(userId);
  if (!ctx) return null;
  const { plan, input } = ctx;
  return {
    planId: plan.id,
    input,
    programs: input.programs
      .filter((p) => p.status === "active")
      .map((p) => ({ id: p.id, name: p.name })),
  };
}

export interface SpentTodayEntry {
  id: string;
  label: string;
  amountCents: number;
  note: string | null;
}

export interface ReadyCard {
  id: string;
  name: string;
  balanceCents: number;
  /** 0..1 — remaining / allocated-to-date, for the liquid fill level. */
  fillRatio: number;
}

export interface HomeView {
  planId: string;
  input: EngineInput;
  state: PlanState;
  asOf: string;
  daysRemaining: number;
  // Zone 1 — hero
  safeTodayCents: number; // left to sip today (accumulated available)
  dailySipCents: number; // the daily Safe-to-Spend amount
  spentTodayS2sCents: number;
  carriedOverCents: number;
  // Zone 3 — ready to sip
  ready: ReadyCard[];
  readyTotal: number;
  // Zone 4 — coming up
  comingUp: { date: string; name: string; amountCents: number }[];
  comingUpTotal: number;
  nextOccurrenceDate: string | null;
  // Spent today — the transactions logged today (tap to edit)
  spentToday: SpentTodayEntry[];
  spentTodayTotalCents: number;
  // for the reporting flow / new-program screen
  programs: { id: string; name: string }[];
  // Liquidity strip — the next crunch point within 60 days, or null (§6.2).
  crunch: HomeCrunch | null;
}

export interface HomeCrunch {
  date: string;
  cashCents: number;
  shortfallCents: number;
  clearsOn: string | null;
}

export async function getHomeView(userId: string): Promise<HomeView | null> {
  const ctx = await loadPlanContext(userId);
  if (!ctx) return null;
  const { plan, input } = ctx;

  const state = computePlanState(input, APP_ASOF);
  const daysRemaining = daysInclusive(APP_ASOF, input.plan.endDate);

  // The daily sip that applies going forward. Today's own baseline
  // (state.baselineCents) is still the pre-recalc rate on an overspend day —
  // the engine only lowers it from tomorrow. snapshotAt at asOf+1 gives that
  // go-forward rate, and equals today's rate when nothing has changed, so the
  // number people see matches what they'll actually sip next.
  const forwardDailyCents = snapshotAt(
    input,
    addDays(APP_ASOF, 1),
  ).baselineCents;

  const spentTodayS2sCents = input.spends
    .filter((s) => s.date === APP_ASOF && s.type === "s2s")
    .reduce((sum, s) => sum + s.amountCents, 0);
  // What carried over from before today = balance + today's spend - today's grant.
  const carriedOverCents = Math.max(
    0,
    state.s2sBalanceCents + spentTodayS2sCents - state.baselineCents,
  );

  // Zone 3 — Ready to sip: grouped buckets with money sitting ready now.
  const groups = buildProgramGroups(plan, input, state, APP_ASOF);
  const readyAll = groups
    .filter((g) => g.balanceCents > 0)
    .sort((a, b) => b.balanceCents - a.balanceCents);
  const ready: ReadyCard[] = readyAll.slice(0, 3).map((g) => ({
    id: g.id,
    name: g.name,
    balanceCents: g.balanceCents,
    fillRatio:
      g.allocatedToDateCents > 0
        ? Math.min(1, Math.max(0, g.balanceCents / g.allocatedToDateCents))
        : 1,
  }));

  // Zone 4 — Coming up: nearest upcoming occurrences (active programs only).
  const comingAll = input.programs
    .filter((p) => p.status === "active")
    .flatMap((p) =>
      occurrencesFor(p, input.plan)
        .filter((d) => d > APP_ASOF)
        .map((d) => ({
          date: d,
          name: p.name,
          amountCents: p.amountPerOccurrenceCents,
        })),
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Today's logged transactions (newest first), for the editable "Spent today".
  const nameById = new Map(input.programs.map((p) => [p.id, p.name]));
  const spentToday: SpentTodayEntry[] = input.spends
    .filter((s) => s.date === APP_ASOF)
    .map((s) => ({
      id: s.id,
      label:
        s.type === "program"
          ? nameById.get(s.programSpendId ?? "") ?? "Program Spend"
          : "Safe to Spend",
      amountCents: s.amountCents,
      note: s.note ?? null,
    }))
    .reverse();
  const spentTodayTotalCents = spentToday.reduce(
    (sum, s) => sum + s.amountCents,
    0,
  );

  // Liquidity strip: the first UPCOMING crunch (today .. +60 days). The daily is
  // never capped by this (§2.2); it only warns. A solvency deficit owns the
  // message instead, so we suppress the crunch then (§6.3).
  const crunch = findUpcomingCrunch(input, state, APP_ASOF);

  return {
    planId: plan.id,
    input,
    state,
    asOf: APP_ASOF,
    daysRemaining,
    safeTodayCents: state.s2sBalanceCents,
    dailySipCents: forwardDailyCents,
    spentTodayS2sCents,
    carriedOverCents,
    ready,
    readyTotal: readyAll.length,
    comingUp: comingAll.slice(0, 3),
    comingUpTotal: comingAll.length,
    nextOccurrenceDate: comingAll[0]?.date ?? null,
    spentToday,
    spentTodayTotalCents,
    programs: input.programs
      .filter((p) => p.status === "active")
      .map((p) => ({ id: p.id, name: p.name })),
    crunch,
  };
}

/** First crunch point on or after `asOf` and within 60 days — the window the
 *  liquidity strip shows (§6.2). Suppressed when the plan is in solvency deficit
 *  (§6.3): the deficit banner speaks instead. */
function findUpcomingCrunch(
  input: EngineInput,
  state: PlanState,
  asOf: string,
): HomeCrunch | null {
  if (state.isDeficit) return null;
  const buffer = input.bufferCents ?? 0;
  const within = addDays(asOf, 60);
  const { series } = projectCash(input, asOf);
  const idx = series.findIndex(
    (d) => d.date >= asOf && d.date <= within && d.cashCents < buffer,
  );
  if (idx === -1) return null;
  const day = series[idx];
  let clearsOn: string | null = null;
  for (let j = idx + 1; j < series.length; j++) {
    if (series[j].cashCents >= buffer) {
      clearsOn = series[j].date;
      break;
    }
  }
  return {
    date: day.date,
    cashCents: day.cashCents,
    shortfallCents: buffer - day.cashCents,
    clearsOn,
  };
}

export interface SpendEntryDetail {
  id: string;
  amountCents: number;
  type: string;
  note: string | null;
  date: string;
  programName: string | null;
}

export async function getSpendEntry(
  userId: string,
  id: string,
): Promise<SpendEntryDetail | null> {
  const entry = await prisma.spendEntry.findFirst({
    where: { id, plan: { userId } },
    include: { programSpend: true },
  });
  if (!entry) return null;
  return {
    id: entry.id,
    amountCents: entry.amountCents,
    type: entry.type,
    note: entry.note ?? null,
    date: entry.date,
    programName: entry.programSpend?.name ?? null,
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

export interface ProgramGroup {
  id: string; // active member id (for links/detail)
  name: string;
  reservedTotalCents: number;
  spentCents: number;
  balanceCents: number;
  /** Amount allocated by occurrences on/before asOf — the fill denominator. */
  allocatedToDateCents: number;
  nextOccurrence: string | null;
}

/** Group linked effective-dated versions (same groupId) into one accumulating bucket. */
function buildProgramGroups(
  plan: PlanWithRelations,
  input: EngineInput,
  state: PlanState,
  asOf: string,
): ProgramGroup[] {
  const bucketByProgram = new Map(
    state.buckets.map((b) => [b.programSpendId, b]),
  );
  const engineById = new Map(input.programs.map((ep) => [ep.id, ep]));
  const statusById = new Map(plan.programs.map((p) => [p.id, p.status]));

  const groups = new Map<string, string[]>();
  for (const p of plan.programs) {
    if (p.status === "cancelled") continue;
    const key = p.groupId ?? p.id;
    const arr = groups.get(key) ?? [];
    arr.push(p.id);
    groups.set(key, arr);
  }

  return [...groups.values()].map((ids) => {
    const activeId =
      ids.find((i) => statusById.get(i) === "active") ?? ids[ids.length - 1];
    let reservedTotalCents = 0;
    let allocatedToDateCents = 0;
    let balanceCents = 0;
    let nextOccurrence: string | null = null;
    for (const i of ids) {
      const ep = engineById.get(i);
      if (!ep) continue;
      const occs = occurrencesFor(ep, input.plan);
      reservedTotalCents += occs.length * ep.amountPerOccurrenceCents;
      allocatedToDateCents +=
        occs.filter((d) => d <= asOf).length * ep.amountPerOccurrenceCents;
      balanceCents += bucketByProgram.get(i)?.balanceCents ?? 0;
      const nxt = occs.find((d) => d > asOf);
      if (nxt && (nextOccurrence === null || nxt < nextOccurrence)) {
        nextOccurrence = nxt;
      }
    }
    const spentCents = input.spends
      .filter(
        (s) =>
          s.type === "program" &&
          s.programSpendId != null &&
          ids.includes(s.programSpendId),
      )
      .reduce((sum, s) => sum + s.amountCents, 0);
    return {
      id: activeId,
      name: engineById.get(activeId)?.name ?? "Program Spend",
      reservedTotalCents,
      spentCents,
      balanceCents,
      allocatedToDateCents,
      nextOccurrence,
    };
  });
}

function byNextOccurrence(a: ProgramGroup, b: ProgramGroup): number {
  if (a.nextOccurrence === b.nextOccurrence) return 0;
  if (a.nextOccurrence === null) return 1;
  if (b.nextOccurrence === null) return -1;
  return a.nextOccurrence < b.nextOccurrence ? -1 : 1;
}

export async function getProgramsView(
  userId: string,
): Promise<{ cards: ProgramCard[]; asOf: string } | null> {
  const ctx = await loadPlanContext(userId);
  if (!ctx) return null;
  const { plan, input } = ctx;
  const state = computePlanState(input, APP_ASOF);
  const groups = buildProgramGroups(plan, input, state, APP_ASOF).sort(
    byNextOccurrence,
  );
  const cards: ProgramCard[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    reservedTotalCents: g.reservedTotalCents,
    spentCents: g.spentCents,
    balanceCents: g.balanceCents,
    nextOccurrence: g.nextOccurrence,
  }));

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
          ? nameById.get(s.programSpendId ?? "") ?? "Program Spend"
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
  const ctx = await loadPlanContext(userId);
  if (!ctx) return null;
  const { plan, input } = ctx;
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
    dailyCents: snapshotAt(input, addDays(APP_ASOF, 1)).baselineCents,
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
  input: EngineInput;
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
  const ctx = await loadPlanContext(userId);
  if (!ctx) return null;
  const { plan, input } = ctx;
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
    input,
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
