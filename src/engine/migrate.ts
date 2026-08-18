// Migration from the legacy scalar-pool model to the composed-pool model
// (spec Part 10, T13 + the B1 blocker). Pure and framework-free: it maps plain
// legacy data to the new-model rows and to an EngineInput, so it can be unit
// tested without a database. A thin Prisma wrapper persists the result at ship
// time (src/lib), reusing this mapping.
//
// 🔴 B1 — the dangerous invariant. `Plan.poolAmountCents` holds the ORIGINAL
// onboarding pool only; logged income lives in separate `income_add` rows and is
// summed at compute time. Verified by code inspection: `addInflowAction` writes a
// PlanAdjustment and never mutates `poolAmountCents`. The migration therefore
// maps pool → one Asset and each income row → one Tranche. If income were ever
// folded into the pool, mapping both would double-count it on every plan — so
// `assertPoolInvariant` reconciles total money on every migration and throws
// rather than let a plausible-looking corruption through.

import type {
  Certainty,
  EngineInput,
  EngineProgramSpend,
  EngineSpendEntry,
  ISODate,
  TrancheStatus,
} from "./types";

export interface LegacyIncome {
  amountCents: number;
  date: ISODate;
}

export interface LegacyPlan {
  poolAmountCents: number;
  startDate: ISODate;
  endDate: ISODate;
  /** From `PlanAdjustment` rows with type = "income_add". */
  incomes: LegacyIncome[];
  programs: EngineProgramSpend[];
  spends?: EngineSpendEntry[];
}

export interface MigratedAsset {
  label: string;
  balanceCents: number;
  spendable: boolean;
  asOf: ISODate;
}

export interface MigratedTranche {
  label: string;
  kind: string;
  grossCents: number;
  feesCents: number;
  passthroughCents: number;
  expectedDate: ISODate;
  certainty: Certainty;
  status: TrancheStatus;
  actualCents: number;
  actualDate: ISODate;
}

export interface MigratedHousehold {
  household: {
    horizonStart: ISODate;
    horizonEnd: ISODate;
    timezone: string;
    privacyMode: string;
  };
  member: { role: string; bufferCents: number };
  asset: MigratedAsset;
  tranches: MigratedTranche[];
}

export class PoolInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoolInvariantError";
  }
}

/** Map one legacy plan to the new-model rows. `timezone` defaults to UTC when the
 *  browser value is unknown (the migration can't know the user's zone). */
export function migratePlan(
  legacy: LegacyPlan,
  timezone = "UTC",
): MigratedHousehold {
  const migrated: MigratedHousehold = {
    household: {
      horizonStart: legacy.startDate,
      horizonEnd: legacy.endDate,
      timezone,
      privacyMode: "shared_only",
    },
    member: { role: "owner", bufferCents: 0 },
    asset: {
      label: "Starting balance",
      balanceCents: legacy.poolAmountCents, // B1: original pool ONLY, never + income
      spendable: true,
      asOf: legacy.startDate,
    },
    tranches: legacy.incomes.map((inc) => ({
      label: "Logged income",
      kind: "other",
      grossCents: inc.amountCents,
      feesCents: 0,
      passthroughCents: 0,
      expectedDate: inc.date,
      certainty: "confirmed" as const,
      status: "received" as const, // already landed
      actualCents: inc.amountCents,
      actualDate: inc.date,
    })),
  };
  assertPoolInvariant(legacy, migrated);
  return migrated;
}

/** 🔴 B1 permanent guard. Total money must be conserved, and the asset must be
 *  the pool alone. Catches both loss and the double-count that would occur if the
 *  source pool had ever absorbed income. */
export function assertPoolInvariant(
  legacy: LegacyPlan,
  m: MigratedHousehold,
): void {
  if (m.asset.balanceCents !== legacy.poolAmountCents) {
    throw new PoolInvariantError(
      `asset (${m.asset.balanceCents}) must equal the original pool (${legacy.poolAmountCents}), not pool + income`,
    );
  }
  const legacyTotal =
    legacy.poolAmountCents +
    legacy.incomes.reduce((s, i) => s + i.amountCents, 0);
  const trancheNet = (t: MigratedTranche) =>
    Math.max(0, t.grossCents - t.feesCents - t.passthroughCents);
  const migratedTotal =
    m.asset.balanceCents + m.tranches.reduce((s, t) => s + trancheNet(t), 0);
  if (migratedTotal !== legacyTotal) {
    throw new PoolInvariantError(
      `total money not conserved: migrated ${migratedTotal} vs legacy ${legacyTotal} (income double-counted or lost)`,
    );
  }
}

/** Build the new-model EngineInput from a migrated household. Obligations keep
 *  their shape (scope becomes "personal"); the pool now comes entirely from the
 *  asset + tranches, with the legacy scalar seeded to 0. */
export function migratedEngineInput(
  legacy: LegacyPlan,
  m: MigratedHousehold,
): EngineInput {
  return {
    plan: { poolCents: 0, startDate: legacy.startDate, endDate: legacy.endDate },
    programs: legacy.programs,
    spends: legacy.spends ?? [],
    bufferCents: m.member.bufferCents,
    assets: [
      { balanceCents: m.asset.balanceCents, spendable: m.asset.spendable },
    ],
    tranches: m.tranches.map((t, i) => ({
      id: `mig-${i}`,
      grossCents: t.grossCents,
      feesCents: t.feesCents,
      passthroughCents: t.passthroughCents,
      date: t.expectedDate,
      certainty: t.certainty,
      status: t.status,
    })),
  };
}
