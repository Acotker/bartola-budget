import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import {
  computePlanState,
  snapshotAt,
  occurrencesFor,
  daysInclusive,
  addDays,
  projectCash,
  memberEngineInput,
  memberState,
  memberCash,
  householdCash,
  sharedBucketBalance,
  type Certainty,
  type EngineInput,
  type EngineProgramSpend,
  type EngineSpendEntry,
  type PlanState,
  type ProgramStatus,
  type RecurrenceFreq,
  type TrancheStatus,
  type Household as EngineHousehold,
  type HouseholdMember as EngineHouseholdMember,
  type SharedObligation as EngineSharedObligation,
  type SharedSpend as EngineSharedSpend,
  type Advance as EngineAdvance,
  type SplitRule as EngineSplitRule,
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
type DbProgram = PlanWithRelations["programs"][number];

/** Map a persisted ProgramSpend row to the engine's program shape. */
function dbProgramToEngine(p: DbProgram): EngineProgramSpend {
  return {
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
  };
}

export function planToEngineInput(
  plan: PlanWithRelations,
  member?: MemberWithHoldings | null,
): EngineInput {
  const programs: EngineProgramSpend[] = plan.programs.map(dbProgramToEngine);

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

// ── Household (P2) — the three Safe-to-Spends ─────────────────────────────────

export interface HouseholdMemberView {
  memberId: string;
  displayName: string;
  isYou: boolean;
  /** Privacy: is this member's personal number visible to the viewer (§8.3)? */
  visible: boolean;
  dailyCents: number | null; // null when private
  safeTodayCents: number | null;
  isDeficit: boolean;
  /** Whether they have a crunch affecting the household — shareable even when
   *  the personal number isn't (§8.3). */
  hasCrunch: boolean;
}

export interface HouseholdView {
  asOf: string;
  members: HouseholdMemberView[];
  /** The shared Safe-to-Spend bucket ("can we afford dinner?"), or null. */
  shared: { name: string; balanceCents: number } | null;
  householdHasCrunch: boolean;
}

/** Assemble the household from the DB and compute all three Safe-to-Spends.
 *  Returns null when the user isn't in a 2+ member household (the caller shows
 *  the single-person home instead). */
export async function getHouseholdView(
  userId: string,
): Promise<HouseholdView | null> {
  const me = await prisma.member.findFirst({ where: { userId } });
  if (!me) return null;

  const dbMembers = await prisma.member.findMany({
    where: { householdId: me.householdId },
    include: {
      assets: true,
      tranches: true,
      user: {
        include: {
          plans: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { programs: true, spends: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (dbMembers.length < 2) return null; // not a couple

  const household = await prisma.household.findUnique({
    where: { id: me.householdId },
  });
  const firstPlan = dbMembers[0].user.plans[0];
  const startDate = household?.horizonStart ?? firstPlan?.startDate ?? APP_ASOF;
  const endDate = household?.horizonEnd ?? firstPlan?.endDate ?? APP_ASOF;

  // Shared obligations across the household's plans (scope = "shared"), deduped.
  const sharedProgramsMap = new Map<string, DbProgram>();
  for (const m of dbMembers) {
    for (const plan of m.user.plans) {
      for (const p of plan.programs) {
        if (p.scope === "shared") sharedProgramsMap.set(p.id, p);
      }
    }
  }
  const sharedPrograms = [...sharedProgramsMap.values()];
  const sharedIds = new Set(sharedPrograms.map((p) => p.id));

  const ruleIds = sharedPrograms
    .map((p) => p.splitRuleId)
    .filter((x): x is string => !!x);
  const dbRules = ruleIds.length
    ? await prisma.splitRule.findMany({ where: { id: { in: ruleIds } } })
    : [];
  const ruleById = new Map(dbRules.map((r) => [r.id, r]));

  const sharedObligations: EngineSharedObligation[] = sharedPrograms.map((p) => {
    const dbr = p.splitRuleId ? ruleById.get(p.splitRuleId) : undefined;
    const rule: EngineSplitRule = dbr
      ? {
          type: dbr.type as EngineSplitRule["type"],
          config: (dbr.config as EngineSplitRule["config"]) ?? {},
        }
      : { type: "equal", config: {} };
    return { program: dbProgramToEngine(p), rule };
  });

  // Shared spends: SpendEntry against a shared obligation, attributed to the
  // logging member (its plan owner).
  const sharedSpends: EngineSharedSpend[] = [];
  for (const m of dbMembers) {
    for (const plan of m.user.plans) {
      for (const s of plan.spends) {
        if (s.programSpendId && sharedIds.has(s.programSpendId)) {
          sharedSpends.push({
            memberId: m.id,
            sharedObligationId: s.programSpendId,
            date: s.date,
            amountCents: s.amountCents,
          });
        }
      }
    }
  }

  const memberIds = dbMembers.map((m) => m.id);
  const dbAdvances = await prisma.advance.findMany({
    where: {
      fromMemberId: { in: memberIds },
      toMemberId: { in: memberIds },
    },
  });
  const advances: EngineAdvance[] = dbAdvances.map((a) => ({
    fromMemberId: a.fromMemberId,
    toMemberId: a.toMemberId,
    amountCents: a.amountCents,
    date: a.date,
    expectedSettleDate: a.expectedSettleDate,
    status: a.status as "open" | "settled",
  }));

  const engineMembers: EngineHouseholdMember[] = dbMembers.map((m) => {
    const plan = m.user.plans[0];
    return {
      id: m.id,
      assets: m.assets.map((a) => ({
        balanceCents: a.balanceCents,
        spendable: a.spendable,
      })),
      tranches: m.tranches.map((t) => ({
        id: t.id,
        grossCents: t.grossCents,
        feesCents: t.feesCents,
        passthroughCents: t.passthroughCents,
        date: t.expectedDate,
        certainty: t.certainty as Certainty,
        status: t.status as TrancheStatus,
      })),
      bufferCents: m.bufferCents,
      personalObligations: (plan?.programs ?? [])
        .filter((p) => p.scope !== "shared")
        .map(dbProgramToEngine),
      spends: (plan?.spends ?? [])
        .filter((s) => !(s.programSpendId && sharedIds.has(s.programSpendId)))
        .map((s) => ({
          id: s.id,
          date: s.date,
          amountCents: s.amountCents,
          type: (s.type === "program" ? "program" : "s2s") as "program" | "s2s",
          programSpendId: s.programSpendId ?? undefined,
        })),
    };
  });

  const engineHousehold: EngineHousehold = {
    startDate,
    endDate,
    members: engineMembers,
    sharedObligations,
    advances,
    sharedSpends,
  };

  const fullTransparency = household?.privacyMode === "full_transparency";
  const members: HouseholdMemberView[] = dbMembers.map((m) => {
    const isYou = m.userId === userId;
    const visible = isYou || fullTransparency;
    const crunch = memberCash(engineHousehold, m.id, APP_ASOF).crunch;
    let dailyCents: number | null = null;
    let safeTodayCents: number | null = null;
    let isDeficit = false;
    if (visible) {
      const state = memberState(engineHousehold, m.id, APP_ASOF);
      dailyCents = snapshotAt(
        memberEngineInput(engineHousehold, m.id),
        addDays(APP_ASOF, 1),
      ).baselineCents;
      safeTodayCents = state.s2sBalanceCents;
      isDeficit = state.isDeficit;
    }
    return {
      memberId: m.id,
      displayName: isYou ? "You" : m.displayName || "Partner",
      isYou,
      visible,
      dailyCents,
      safeTodayCents,
      isDeficit,
      hasCrunch: crunch != null,
    };
  });

  const sharedBucket = sharedPrograms.find(
    (p) => p.kind === "shared_discretionary",
  );
  const shared = sharedBucket
    ? {
        name: sharedBucket.name,
        balanceCents: sharedBucketBalance(
          engineHousehold,
          sharedBucket.id,
          APP_ASOF,
        ),
      }
    : null;

  return {
    asOf: APP_ASOF,
    members,
    shared,
    householdHasCrunch: householdCash(engineHousehold, APP_ASOF).crunch != null,
  };
}

// ── Invite proposal view (§8.2) ───────────────────────────────────────────────

export interface InviteSharedItem {
  name: string;
  amountPerOccurrenceCents: number;
  freq: string | null;
  splitLabel: string;
}

export interface InviteView {
  status: "valid" | "used" | "not_found";
  proposerName: string;
  horizonStart: string;
  horizonEnd: string;
  sharedObligations: InviteSharedItem[];
}

function splitLabelFor(type: string | undefined): string {
  if (type === "equal") return "split equally";
  if (type === "single_payer") return "covered by one of you";
  if (type === "fixed_amounts") return "split by fixed amounts";
  if (type === "custom_percent") return "split proportionally";
  return "split by agreement";
}

/** What an invitee sees before accepting: who invited them, the household's
 *  horizon, and the shared costs + how they're split (§8.2 — "your partner
 *  proposed this"). Doesn't require the viewer to have a session. */
export async function getInviteView(token: string): Promise<InviteView | null> {
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { household: { include: { members: true } } },
  });
  if (!invite) return { status: "not_found", proposerName: "", horizonStart: "", horizonEnd: "", sharedObligations: [] };
  if (invite.usedAt) {
    return {
      status: "used",
      proposerName: "",
      horizonStart: invite.household.horizonStart,
      horizonEnd: invite.household.horizonEnd,
      sharedObligations: [],
    };
  }

  const proposer =
    invite.household.members.find((m) => m.role === "owner") ??
    invite.household.members[0];
  const proposerUser = proposer
    ? await prisma.user.findUnique({ where: { id: proposer.userId } })
    : null;
  const proposerName =
    proposer?.displayName?.trim() ||
    proposerUser?.email.split("@")[0] ||
    "Your partner";

  const memberUserIds = invite.household.members.map((m) => m.userId);
  const plans = memberUserIds.length
    ? await prisma.plan.findMany({
        where: { userId: { in: memberUserIds } },
        include: { programs: { where: { scope: "shared" } } },
      })
    : [];
  const sharedPrograms = plans.flatMap((p) => p.programs);
  const ruleIds = sharedPrograms
    .map((p) => p.splitRuleId)
    .filter((x): x is string => !!x);
  const rules = ruleIds.length
    ? await prisma.splitRule.findMany({ where: { id: { in: ruleIds } } })
    : [];
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  const sharedObligations: InviteSharedItem[] = sharedPrograms.map((p) => ({
    name: p.name,
    amountPerOccurrenceCents: p.amountPerOccurrenceCents,
    freq: p.freq,
    splitLabel: splitLabelFor(p.splitRuleId ? ruleById.get(p.splitRuleId)?.type : undefined),
  }));

  return {
    status: "valid",
    proposerName,
    horizonStart: invite.household.horizonStart,
    horizonEnd: invite.household.horizonEnd,
    sharedObligations,
  };
}
