// §5 — Detection pipeline. Pure: transactions in, candidates out.

import { DateTime } from "luxon";
import { ZONE } from "@/engine";
import { titleCaseMerchant } from "./normalize";
import { MERGE_SIMILARITY_THRESHOLD, tokenSetSimilarity } from "./similarity";
import type {
  Cadence,
  Candidate,
  ConfidenceTier,
  ISODate,
  ParsedTransaction,
} from "./types";

// ---------------------------------------------------------------- amounts

/**
 * Stage C tolerance: "consistent enough to be one subscription" = within $1 or
 * 10% of the average, whichever is larger, so both small flat fees and larger
 * variable-but-similar charges behave sensibly.
 */
export function amountsConsistent(amounts: number[]): boolean {
  if (amounts.length < 2) return true;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  return max - min <= Math.max(100, Math.round(0.1 * avg));
}

/**
 * Split a merchant's transactions into amount clusters.
 *
 * Improvement over the literal spec: the spec says to discard a group whose
 * amount spread is too wide. Doing exactly that would throw away the twelve
 * $9.99 charges just because one $200 purchase shares the merchant name. So
 * instead we sub-cluster by amount and evaluate each cluster on its own — the
 * subscription survives and the one-off falls out naturally (its cluster has a
 * single occurrence).
 */
export function clusterByAmount(txns: ParsedTransaction[]): ParsedTransaction[][] {
  const sorted = [...txns].sort((a, b) => a.amountCents - b.amountCents);
  const clusters: ParsedTransaction[][] = [];
  let current: ParsedTransaction[] = [];

  for (const t of sorted) {
    if (current.length === 0) {
      current = [t];
      continue;
    }
    const trial = [...current, t].map((x) => x.amountCents);
    if (amountsConsistent(trial)) current.push(t);
    else {
      clusters.push(current);
      current = [t];
    }
  }
  if (current.length > 0) clusters.push(current);
  return clusters;
}

// ---------------------------------------------------------------- intervals

interface Bucket {
  cadence: Exclude<Cadence, "onetime">;
  min: number;
  max: number;
  centre: number;
}

/** Stage D tolerance windows. Annual is a deliberate v1 gap (see spec §2). */
export const BUCKETS: Bucket[] = [
  { cadence: "daily", min: 1, max: 2, centre: 1 },
  { cadence: "weekly", min: 5, max: 9, centre: 7 },
  { cadence: "biweekly", min: 11, max: 17, centre: 14 },
  { cadence: "monthly", min: 25, max: 35, centre: 30 },
];

function daysBetween(a: ISODate, b: ISODate): number {
  const from = DateTime.fromISO(a, { zone: ZONE });
  const to = DateTime.fromISO(b, { zone: ZONE });
  return Math.round(to.diff(from, "days").days);
}

function bucketFor(days: number): Bucket | null {
  return BUCKETS.find((b) => days >= b.min && days <= b.max) ?? null;
}

function deltasOf(dates: ISODate[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < dates.length; i += 1) out.push(daysBetween(dates[i - 1], dates[i]));
  return out;
}

/** True when every consecutive gap falls in the same bucket. */
function fitsOneBucket(dates: ISODate[]): Bucket | null {
  const deltas = deltasOf(dates);
  if (deltas.length === 0) return null;
  const first = bucketFor(deltas[0]);
  if (!first) return null;
  return deltas.every((d) => bucketFor(d)?.cadence === first.cadence) ? first : null;
}

/** Greedily pull out chains whose consecutive gaps all sit inside one bucket. */
function greedyChains(dates: ISODate[], bucket: Bucket): ISODate[][] {
  const remaining = [...dates];
  const chains: ISODate[][] = [];

  while (remaining.length > 0) {
    const start = remaining.shift()!;
    const chain = [start];
    let last = start;
    for (let i = 0; i < remaining.length; ) {
      const gap = daysBetween(last, remaining[i]);
      if (gap >= bucket.min && gap <= bucket.max) {
        chain.push(remaining[i]);
        last = remaining[i];
        remaining.splice(i, 1);
      } else {
        i += 1;
      }
    }
    chains.push(chain);
  }
  return chains;
}

/**
 * Stage D overlapping-series handling. Two same-merchant, same-amount charges on
 * different monthly cycles (say the 2nd and the 15th) produce alternating ~13/~18
 * day gaps that match no bucket — as one series it looks broken. Extracting
 * chains per bucket disentangles them into two clean monthly candidates.
 */
export function splitIntoSeries(dates: ISODate[]): ISODate[][] {
  const sorted = [...dates].sort();
  if (sorted.length < 3) return [sorted];
  if (fitsOneBucket(sorted)) return [sorted];

  let best: ISODate[][] | null = null;
  let bestCoverage = 0;

  // Longest cadence first, and ties keep the earlier (coarser) winner. Two clean
  // monthly cycles on the 2nd and the 15th can also be described as one ragged
  // 13/17-day biweekly chain that covers the same dates; the monthly reading is
  // the more parsimonious explanation, so it must be considered first.
  for (const bucket of [...BUCKETS].reverse()) {
    const chains = greedyChains(sorted, bucket).filter((c) => c.length >= 2);
    if (chains.length < 2) continue;
    const coverage = chains.reduce((sum, c) => sum + c.length, 0);
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      best = chains;
    }
  }

  // Only accept a split that explains essentially the whole timeline.
  if (best && bestCoverage >= sorted.length - 1) return best;
  return [sorted];
}

// ---------------------------------------------------------------- fingerprint

/** Deterministic FNV-1a hash — stable across runs, no crypto/deps needed. */
export function fingerprintFor(normalizedMerchant: string, cadence: Cadence): string {
  const input = `${normalizedMerchant}|${cadence}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------- candidates

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

function mode(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bestValue = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      bestValue = v;
    }
  }
  return bestValue;
}

function nearestBucket(days: number): Bucket {
  return BUCKETS.reduce((best, b) =>
    Math.abs(b.centre - days) < Math.abs(best.centre - days) ? b : best,
  );
}

function buildCandidate(
  normalizedMerchant: string,
  txns: ParsedTransaction[],
): Candidate | null {
  if (txns.length < 2) return null; // a single sighting is not a pattern

  const dates = txns.map((t) => t.date).sort();
  const amounts = txns.map((t) => t.amountCents);
  const minAmountCents = Math.min(...amounts);
  const maxAmountCents = Math.max(...amounts);
  const deltas = deltasOf(dates);
  const med = median(deltas);

  const exact = fitsOneBucket(dates);
  const bucket = exact ?? nearestBucket(med);
  const cadence = bucket.cadence;

  // Stage E — tiering. `high` needs 3+ sightings, every gap in one bucket, and
  // amounts inside tolerance. Everything else that got this far is `possible`
  // and still surfaces (principle 3: recall over precision).
  const tier: ConfidenceTier =
    txns.length >= 3 && exact !== null && amountsConsistent(amounts) ? "high" : "possible";

  const dayOfMonths = dates.map((d) => DateTime.fromISO(d, { zone: ZONE }).day);
  const weekdays = dates.map((d) => DateTime.fromISO(d, { zone: ZONE }).weekday);

  return {
    normalizedMerchant,
    suggestedName: titleCaseMerchant(normalizedMerchant),
    // Principle 2: always the highest observed amount. Under-reserving is the
    // failure mode that breaks trust in Safe to Spend.
    suggestedAmountCents: maxAmountCents,
    minAmountCents,
    maxAmountCents,
    occurrenceCount: txns.length,
    suggestedCadence: cadence,
    confidenceTier: tier,
    firstSeenDate: dates[0],
    lastSeenDate: dates[dates.length - 1],
    fingerprint: fingerprintFor(normalizedMerchant, cadence),
    anchorDay: cadence === "monthly" ? mode(dayOfMonths) : undefined,
    anchorWeekday:
      cadence === "weekly" || cadence === "biweekly" ? mode(weekdays) : undefined,
    medianIntervalDays: med,
    dates,
    sourceTransactions: txns,
  };
}

/** Monthly-equivalent cost, used to sort the review screen by real impact. */
export function monthlyEquivalentCents(amountCents: number, cadence: Cadence): number {
  switch (cadence) {
    case "daily":
      return amountCents * 30;
    case "weekly":
      return Math.round((amountCents * 52) / 12);
    case "biweekly":
      return Math.round((amountCents * 26) / 12);
    case "monthly":
    case "onetime":
      return amountCents;
  }
}

/** Stage B — exact-match grouping, then guarded fuzzy merge. */
function groupTransactions(
  transactions: ParsedTransaction[],
): Map<string, ParsedTransaction[]> {
  const groups = new Map<string, ParsedTransaction[]>();
  for (const t of transactions) {
    if (!t.normalizedDescription) continue;
    const list = groups.get(t.normalizedDescription) ?? [];
    list.push(t);
    groups.set(t.normalizedDescription, list);
  }

  // Merge only when the names are similar AND the amounts are compatible.
  // Never on string similarity alone: two unrelated merchants can share a short name.
  const keys = [...groups.keys()];
  const mergedInto = new Map<string, string>();

  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = mergedInto.get(keys[i]) ?? keys[i];
      const b = mergedInto.get(keys[j]) ?? keys[j];
      if (a === b) continue;
      const listA = groups.get(a);
      const listB = groups.get(b);
      if (!listA || !listB) continue;

      if (tokenSetSimilarity(a, b) < MERGE_SIMILARITY_THRESHOLD) continue;
      const combined = [...listA, ...listB].map((t) => t.amountCents);
      if (!amountsConsistent(combined)) continue;

      // Fold b into a, keeping the shorter name as the canonical key.
      const [keep, drop] = a.length <= b.length ? [a, b] : [b, a];
      const kept = groups.get(keep)!;
      const dropped = groups.get(drop)!;
      groups.set(keep, [...kept, ...dropped]);
      groups.delete(drop);
      mergedInto.set(drop, keep);
      for (const [from, to] of mergedInto) if (to === drop) mergedInto.set(from, keep);
    }
  }

  return groups;
}

/**
 * Full pipeline: Stages B–F.
 * Returns candidates sorted by monthly-equivalent cost, descending.
 */
export function detectCandidates(transactions: ParsedTransaction[]): Candidate[] {
  const groups = groupTransactions(transactions);
  const candidates: Candidate[] = [];

  for (const [merchant, txns] of groups) {
    for (const cluster of clusterByAmount(txns)) {
      if (cluster.length < 2) continue;
      const byDate = new Map<ISODate, ParsedTransaction[]>();
      for (const t of cluster) {
        const list = byDate.get(t.date) ?? [];
        list.push(t);
        byDate.set(t.date, list);
      }
      for (const series of splitIntoSeries([...byDate.keys()])) {
        const seriesTxns = series.flatMap((d) => byDate.get(d) ?? []);
        const candidate = buildCandidate(merchant, seriesTxns);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  return candidates.sort(
    (a, b) =>
      monthlyEquivalentCents(b.suggestedAmountCents, b.suggestedCadence) -
      monthlyEquivalentCents(a.suggestedAmountCents, a.suggestedCadence),
  );
}
