// Financial-intake composition (E1/E3). Pure, side-effect free, integer cents.
//
// The pool that governs the *rate* is composed from what exists today plus every
// included future tranche — NOT date-gated. A tranche you're confident about
// (loan, internship) lifts the daily from day one, so the number stays steady
// instead of spiking when the money lands (the §2.2 decision). A tranche's date
// matters only to the liquidity/cash projection (E2), never to this pool.

import type { EngineInput, EngineTranche } from "./types";

/** Derived, per-tranche figures (§3.4). */
export interface TrancheDerived {
  /** max(0, gross − fees − passthrough). The only part that enters the pool. */
  netCents: number;
  /** max(0, fees + passthrough − gross). When the school's charges exceed the
   *  disbursement, this is a bill the student owes — a prompt to create an
   *  obligation, never a negative inflow (T2). */
  residualOwedCents: number;
  /** True when fees + passthrough >= gross, i.e. the disbursement is entirely
   *  eaten before it reaches the account. */
  fullyConsumed: boolean;
  /** Whether this tranche's net is counted in the pool: confirmed/likely and
   *  not cancelled (conventions C7, 7.1). */
  includedInPool: boolean;
}

export function deriveTranche(t: EngineTranche): TrancheDerived {
  const raw = t.grossCents - t.feesCents - t.passthroughCents;
  return {
    netCents: Math.max(0, raw),
    residualOwedCents: Math.max(0, -raw),
    fullyConsumed: raw <= 0,
    includedInPool:
      (t.certainty === "confirmed" || t.certainty === "likely") &&
      t.status !== "cancelled",
  };
}

/** The composed-pool breakdown, for the rate and for the review-screen diagnosis. */
export interface ComposedPool {
  /** Σ spendable asset balances. */
  spendableAssetsCents: number;
  /** Σ non-spendable asset balances — visible in the UI, excluded from the pool. */
  nonSpendableCents: number;
  /** Σ net of included (confirmed/likely, not cancelled) tranches. */
  includedTranchesCents: number;
  /** Σ net of `hoped` tranches — surfaced separately, never in the pool (C7). */
  upsideCents: number;
  /** spendableAssets + includedTranches. Governs the rate (§2.1). */
  poolProjectedCents: number;
}

export function composePool(input: EngineInput): ComposedPool {
  const assets = input.assets ?? [];
  const tranches = input.tranches ?? [];

  let spendableAssetsCents = 0;
  let nonSpendableCents = 0;
  for (const a of assets) {
    if (a.spendable) spendableAssetsCents += a.balanceCents;
    else nonSpendableCents += a.balanceCents;
  }

  let includedTranchesCents = 0;
  let upsideCents = 0;
  for (const t of tranches) {
    const d = deriveTranche(t);
    if (d.includedInPool) {
      includedTranchesCents += d.netCents;
    } else if (t.certainty === "hoped" && t.status !== "cancelled") {
      upsideCents += d.netCents;
    }
  }

  return {
    spendableAssetsCents,
    nonSpendableCents,
    includedTranchesCents,
    upsideCents,
    poolProjectedCents: spendableAssetsCents + includedTranchesCents,
  };
}

/** Thrown when an intake input is not persistable (e.g. buffer exceeds pool). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** T3: reject a plan whose buffer is larger than the whole pool — it would drive
 *  the daily negative from day one. The legacy scalar `plan.poolCents` counts
 *  toward the pool here so mixed/legacy plans validate too. */
export function validateComposition(input: EngineInput): void {
  const { poolProjectedCents } = composePool(input);
  const totalPool = poolProjectedCents + input.plan.poolCents;
  const buffer = input.bufferCents ?? 0;
  if (buffer > totalPool) {
    throw new ValidationError(
      `buffer (${buffer}) exceeds pool (${totalPool})`,
    );
  }
}
