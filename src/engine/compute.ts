import Decimal from "decimal.js";
import { addDays, daysInclusive } from "./dates";
import { occurrencesFor } from "./occurrences";
import type {
  EngineInput,
  EngineSnapshot,
  ISODate,
  PlanState,
  ProgramBucketState,
} from "./types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

type OccCache = Map<string, ISODate[]>;

interface SnapshotInternal {
  P: number;
  A: number;
  ARP: number;
  RC: number;
  Bprog: number;
  Bs2s: Decimal;
  RD: number;
  UR: Decimal;
  baseline: Decimal;
}

function buildOccCache(input: EngineInput): OccCache {
  const cache: OccCache = new Map();
  for (const prog of input.programs) {
    cache.set(prog.id, occurrencesFor(prog, input.plan));
  }
  return cache;
}

/**
 * The pure Baseline formula (brief §4). Given the effective date `E`, the raw
 * plan data, and the banked S2S balance carried into `E`, produce the snapshot
 * and the Baseline rate. Deterministic and side-effect free.
 */
function computeSnapshot(
  input: EngineInput,
  E: ISODate,
  bankedS2s: Decimal,
  occCache: OccCache,
): SnapshotInternal {
  const { plan } = input;
  const start = plan.startDate;
  const inflows = input.inflows ?? [];

  const P =
    plan.poolCents +
    inflows.filter((i) => i.date < E).reduce((s, i) => s + i.amountCents, 0);
  const A = input.spends
    .filter((s) => s.date < E)
    .reduce((s, e) => s + e.amountCents, 0);
  const ARP = P - A;

  let RC = 0;
  let Bprog = 0;
  for (const prog of input.programs) {
    const entry = prog.addedOn ?? start;
    const cancelled =
      prog.status === "cancelled" ? prog.cancelledOn ?? start : undefined;
    const occs = occCache.get(prog.id) ?? [];

    let allocatedBefore = 0;
    let futureFromE = 0;
    for (const d of occs) {
      if (cancelled && d >= cancelled) continue;
      if (d < E) allocatedBefore += prog.amountPerOccurrenceCents;
      else futureFromE += prog.amountPerOccurrenceCents;
    }
    if (entry <= E) RC += futureFromE;

    const spentBefore = input.spends
      .filter(
        (s) =>
          s.type === "program" && s.programSpendId === prog.id && s.date < E,
      )
      .reduce((s, e) => s + e.amountCents, 0);
    const surplus = allocatedBefore - spentBefore;
    if (surplus > 0) Bprog += surplus;
  }

  const Bs2s = Decimal.max(0, bankedS2s);
  const RD = daysInclusive(E, plan.endDate);
  const UR = new Decimal(ARP).minus(RC).minus(Bprog).minus(Bs2s);
  const baseline = RD > 0 ? UR.div(RD) : new Decimal(0);

  return { P, A, ARP, RC, Bprog, Bs2s, RD, UR, baseline };
}

interface SimResult {
  balance: Decimal;
  currentBaseline: Decimal;
  buckets: Map<string, Decimal>;
  lastSnapshot: SnapshotInternal;
  occCache: OccCache;
}

/**
 * Replay the plan day by day. Baseline is constant within a segment and only
 * recomputed at a recalc trigger's effective date. Grants accumulate; S2S
 * overspend is absorbed (balance reset to 0) and a recalc is scheduled for the
 * next day. All internal math is full-precision; rounding happens only at the
 * display layer.
 */
function simulate(
  input: EngineInput,
  target: ISODate,
  includeGrantTarget: boolean,
): SimResult {
  const { plan } = input;
  const start = plan.startDate;
  const occCache = buildOccCache(input);

  // Recalc effective dates known up front (brief §4 triggers). Overspends add
  // more during the loop. The initial Baseline is effective from the start.
  const effective = new Set<ISODate>([start]);
  for (const prog of input.programs) {
    if (prog.addedOn && prog.addedOn > start) {
      effective.add(addDays(prog.addedOn, 1));
    }
    if (prog.status === "cancelled" && prog.cancelledOn && prog.cancelledOn >= start) {
      effective.add(addDays(prog.cancelledOn, 1));
    }
  }
  for (const inf of input.inflows ?? []) {
    if (inf.date >= start) effective.add(addDays(inf.date, 1));
  }

  const spendsByDate = new Map<ISODate, typeof input.spends>();
  for (const s of input.spends) {
    const list = spendsByDate.get(s.date) ?? [];
    list.push(s);
    spendsByDate.set(s.date, list);
  }

  const occByDate = new Map<ISODate, { progId: string; amount: number }[]>();
  for (const prog of input.programs) {
    for (const d of occCache.get(prog.id) ?? []) {
      const list = occByDate.get(d) ?? [];
      list.push({ progId: prog.id, amount: prog.amountPerOccurrenceCents });
      occByDate.set(d, list);
    }
  }

  const buckets = new Map<string, Decimal>();
  for (const prog of input.programs) buckets.set(prog.id, new Decimal(0));

  let balance = new Decimal(0);
  let currentBaseline = new Decimal(0);
  let lastSnapshot = computeSnapshot(input, start, new Decimal(0), occCache);

  const lastDay = includeGrantTarget ? target : addDays(target, -1);
  let day = start;
  while (day <= lastDay) {
    if (effective.has(day)) {
      lastSnapshot = computeSnapshot(input, day, balance, occCache);
      currentBaseline = lastSnapshot.baseline;
    }

    // Grant the day's Baseline.
    balance = balance.plus(currentBaseline);

    // Reserve this day's program occurrences into their buckets.
    for (const o of occByDate.get(day) ?? []) {
      buckets.set(o.progId, (buckets.get(o.progId) ?? new Decimal(0)).plus(o.amount));
    }

    // Apply the day's spends.
    for (const s of spendsByDate.get(day) ?? []) {
      if (s.type === "s2s") {
        balance = balance.minus(s.amountCents);
      } else if (s.programSpendId) {
        const newBal = (buckets.get(s.programSpendId) ?? new Decimal(0)).minus(
          s.amountCents,
        );
        buckets.set(s.programSpendId, newBal);
        // Program overspend = the bucket goes negative (spent more than the
        // bucket holds, per Examples 4 & 7). The overage is absorbed by the
        // forward Baseline via A; banked S2S is never touched.
        if (newBal.lt(0)) {
          effective.add(addDays(day, 1));
        }
      }
    }

    // S2S overspend: absorb (reset to 0) and recalc tomorrow.
    if (balance.lt(0)) {
      effective.add(addDays(day, 1));
      balance = new Decimal(0);
    }

    day = addDays(day, 1);
  }

  return { balance, currentBaseline, buckets, lastSnapshot, occCache };
}

function toDisplayCents(d: Decimal): number {
  return d.toDecimalPlaces(0).toNumber();
}

function externalSnapshot(snap: SnapshotInternal): EngineSnapshot {
  return {
    poolWithInflowsCents: snap.P,
    actualSpendCents: snap.A,
    availableRemainingPoolCents: snap.ARP,
    remainingCommittedCents: snap.RC,
    programSurplusCents: snap.Bprog,
    s2sBankedCents: toDisplayCents(snap.Bs2s),
    unallocatedRemainderCents: toDisplayCents(snap.UR),
    remainingDays: snap.RD,
    baselineExactCents: snap.baseline.toString(),
  };
}

/** Full plan state as of `asOf` — the current Baseline, balances, and buckets. */
export function computePlanState(input: EngineInput, asOf: ISODate): PlanState {
  const sim = simulate(input, asOf, true);
  const baselineExact = sim.currentBaseline;

  const buckets: ProgramBucketState[] = input.programs.map((prog) => {
    const bal = sim.buckets.get(prog.id) ?? new Decimal(0);
    const occs = sim.occCache.get(prog.id) ?? [];
    const reservedRemaining =
      occs.filter((d) => d > asOf).length * prog.amountPerOccurrenceCents;
    return {
      programSpendId: prog.id,
      name: prog.name,
      balanceCents: toDisplayCents(bal),
      reservedRemainingCents: reservedRemaining,
    };
  });

  return {
    asOf,
    baselineCents: toDisplayCents(baselineExact),
    baselineExactCents: baselineExact.toString(),
    s2sBalanceCents: toDisplayCents(sim.balance),
    buckets,
    isDeficit: baselineExact.lte(0),
    snapshot: externalSnapshot(sim.lastSnapshot),
  };
}

/**
 * The Baseline that a recalculation would produce if it took effect on date `E`,
 * regardless of whether `E` is an actual trigger. Used to prove the brief's
 * Example 3 consistency checks: with and without an overspend.
 */
export function snapshotAt(
  input: EngineInput,
  E: ISODate,
): EngineSnapshot & { baselineCents: number } {
  const sim = simulate(input, E, false);
  const snap = computeSnapshot(input, E, sim.balance, sim.occCache);
  return { ...externalSnapshot(snap), baselineCents: toDisplayCents(snap.baseline) };
}
