// Engine types. All monetary amounts are INTEGER CENTS (no floats in storage/engine).
// Dates are ISO calendar strings 'YYYY-MM-DD' interpreted in America/New_York.

export type ISODate = string;

export type RecurrenceFreq = "daily" | "weekly" | "biweekly" | "monthly";

export type ProgramStatus = "active" | "completed" | "cancelled" | "superseded";

export interface EnginePlan {
  poolCents: number;
  startDate: ISODate;
  endDate: ISODate;
}

export interface EngineProgramSpend {
  id: string;
  name: string;
  isRecurring: boolean;
  amountPerOccurrenceCents: number;
  /** Recurring only. `anchorDay` = day-of-month (monthly); `anchorWeekday` = 1=Mon…7=Sun (weekly/biweekly). */
  recurrence?: { freq: RecurrenceFreq; anchorDay?: number; anchorWeekday?: number };
  /** Recurring window; defaults to the plan window. */
  startDate?: ISODate;
  endDate?: ISODate;
  /** One-time only. */
  targetDate?: ISODate;
  /** When the program entered the plan. Absent (or <= plan start) means it was set up at onboarding. */
  addedOn?: ISODate;
  status?: ProgramStatus;
  cancelledOn?: ISODate;
}

export interface EngineSpendEntry {
  id: string;
  date: ISODate;
  amountCents: number;
  type: "s2s" | "program";
  programSpendId?: string;
  /** Which occurrence this program spend belongs to (ISO date of the occurrence). */
  occurrenceRef?: ISODate;
  note?: string;
}

export interface EngineInflow {
  date: ISODate;
  amountCents: number;
}

// ── Financial-intake model (E1/E3) ──────────────────────────────────────────
// The scalar pool is being replaced by a *composed* pool: spendable assets that
// exist today plus every included future tranche, net of fees/passthrough.

/** Certainty of a future tranche. `confirmed`/`likely` enter the pool; `hoped`
 *  is excluded and surfaced separately as upside (convention C7). */
export type Certainty = "confirmed" | "likely" | "hoped";

/** Lifecycle of a tranche. `cancelled` is the only status removed from the pool;
 *  `late` stays in (convention 7.1). */
export type TrancheStatus = "pending" | "received" | "late" | "cancelled";

/** Money that exists today. `spendable=false` (emergency fund, retirement) is
 *  visible in the UI but excluded from the pool (§3.3). */
export interface EngineAsset {
  balanceCents: number;
  spendable: boolean;
}

/** A future (or already-received) arrival of money. Only `netCents` enters the
 *  pool; net is derived as max(0, gross − fees − passthrough) (§3.4). For the
 *  *rate*, tranches count across the full horizon regardless of `date` — the
 *  steady-number rule (§2.2). `date` governs liquidity/cash-projection only. */
export interface EngineTranche {
  id: string;
  grossCents: number;
  feesCents: number;
  passthroughCents: number;
  date: ISODate;
  certainty: Certainty;
  /** Defaults to "pending" when absent. */
  status?: TrancheStatus;
}

export interface EngineInput {
  plan: EnginePlan;
  programs: EngineProgramSpend[];
  spends: EngineSpendEntry[];
  inflows?: EngineInflow[];
  /** Composed-pool inputs (E1/E3). When present, their spendable/included totals
   *  add to `plan.poolCents`. `bufferCents` is subtracted before amortizing. */
  assets?: EngineAsset[];
  tranches?: EngineTranche[];
  bufferCents?: number;
}

export interface ProgramBucketState {
  programSpendId: string;
  name: string;
  /** Current carried balance (allocated minus spent) in cents; may be a rounded display value. */
  balanceCents: number;
  /** Planned amount still to be reserved for occurrences after `asOf`. */
  reservedRemainingCents: number;
}

export interface EngineSnapshot {
  /** P — pool plus inflows to date. */
  poolWithInflowsCents: number;
  /** A — all actual spend to date. */
  actualSpendCents: number;
  /** ARP = P - A. */
  availableRemainingPoolCents: number;
  /** RC — remaining committed (future occurrences from the effective date). */
  remainingCommittedCents: number;
  /** B_prog — carried program surpluses from past occurrences. */
  programSurplusCents: number;
  /** B_s2s — banked S2S balance if positive, else 0. */
  s2sBankedCents: number;
  /** UR = ARP - RC - B_prog - B_s2s. */
  unallocatedRemainderCents: number;
  /** RD — remaining days from the effective date through the runway end, inclusive. */
  remainingDays: number;
  /** Baseline rate in cents/day, full precision as a string. */
  baselineExactCents: string;
}

export interface PlanState {
  asOf: ISODate;
  /** Baseline (daily S2S grant) rate in cents, rounded for display. */
  baselineCents: number;
  /** Baseline rate in cents at full precision (string form of a decimal). */
  baselineExactCents: string;
  /** Accumulated available S2S balance in cents, rounded for display. */
  s2sBalanceCents: number;
  buckets: ProgramBucketState[];
  isDeficit: boolean;
  /** The snapshot behind the currently-effective Baseline. */
  snapshot: EngineSnapshot;
}
