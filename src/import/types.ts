// Subscription Import — shared types.
//
// This module is pure: no DB, no UI, no I/O. It takes CSV text in and returns
// candidates out, so it can be unit-tested the same way `src/engine/` is.
// All money is INTEGER CENTS and all dates are ISO 'YYYY-MM-DD' strings,
// matching the engine's invariants.

export type ISODate = string;

/**
 * Cadence vocabulary. Deliberately the SAME strings the existing ProgramSpend
 * model uses (`freq`), so a confirmed candidate maps straight through without a
 * translation layer. (The build spec called the two-week case
 * `every_two_weeks`; the repo already uses `biweekly`, so we follow the repo.)
 * `onetime` is never produced by detection — it exists so a user can override a
 * suggestion to one-time on the review screen.
 */
export type Cadence = "daily" | "weekly" | "biweekly" | "monthly" | "onetime";

export type ConfidenceTier = "high" | "possible";

/** Which sign in a single-Amount column represents money leaving the account. */
export type SignConvention = "negative-is-spend" | "positive-is-spend";

export interface ParsedTransaction {
  date: ISODate;
  rawDescription: string;
  normalizedDescription: string;
  /** Always positive. Only outflows are kept. */
  amountCents: number;
  sourceAccountLabel?: string;
}

export interface DetectedColumns {
  date: number;
  description: number;
  /** Single signed amount column, when present. */
  amount?: number;
  /** Separate debit/credit columns, when present (debit preferred as the outflow). */
  debit?: number;
  credit?: number;
  account?: number;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  /** Data rows seen (excludes the header). */
  totalRows: number;
  /** Rows skipped for unparseable date/amount. */
  skippedRows: number;
  /**
   * True when a single Amount column has a roughly 50/50 sign split, so we
   * can't safely infer which sign means "spend". Callers must ask the user
   * rather than guess — a silent misread would invert the entire file.
   */
  signAmbiguous: boolean;
  /** Which convention was actually applied (null when debit/credit columns were used). */
  signConvention: SignConvention | null;
  columns: DetectedColumns | null;
  /** Set when the file could not be parsed at all. */
  error?: string;
}

export interface Candidate {
  normalizedMerchant: string;
  suggestedName: string;
  /** Per governing principle 2: the MAX observed amount, never the average. */
  suggestedAmountCents: number;
  minAmountCents: number;
  maxAmountCents: number;
  occurrenceCount: number;
  suggestedCadence: Cadence;
  confidenceTier: ConfidenceTier;
  firstSeenDate: ISODate;
  lastSeenDate: ISODate;
  /** Stable hash of merchant + cadence, for recognising this across future uploads. */
  fingerprint: string;
  /** Day-of-month anchor for monthly cadence (mode of observed dates). */
  anchorDay?: number;
  /** Weekday anchor (1=Mon..7=Sun) for weekly/biweekly cadence. */
  anchorWeekday?: number;
  /** Median gap in days between occurrences — used for plain-language copy. */
  medianIntervalDays?: number;
  /** The dates this candidate was built from, for review-screen context. */
  dates: ISODate[];
  /**
   * The exact transactions this candidate was built from. Carried so persistence
   * can link rows to candidates directly instead of re-deriving the match.
   */
  sourceTransactions: ParsedTransaction[];
}
