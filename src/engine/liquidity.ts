// Cash / liquidity projection and crunch points (E2, spec Part 6).
//
// This layer answers a DIFFERENT question from the rate engine. The rate (daily
// Safe-to-Spend) is computed on the projected pool and never capped by cash — a
// steady number (§2.2). Liquidity asks: given WHEN money actually lands and WHEN
// bills go out, is there a day the account physically can't cover the buffer?
// It never changes the daily number; it only surfaces a crunch point.
//
// Pure, integer cents. Kept in its own module (imports the rate engine, not the
// reverse) so there is no cycle: compute.ts -> intake.ts, liquidity.ts -> both.

import { computePlanState } from "./compute";
import { addDays } from "./dates";
import { composePool, deriveTranche } from "./intake";
import { occurrencesFor } from "./occurrences";
import type { EngineInput, EngineTranche, ISODate } from "./types";

/** A tranche contributes to CASH when it's confident money that hasn't failed to
 *  arrive: confirmed/likely and neither late nor cancelled (§6.1, C7). Note this
 *  differs from pool inclusion, which keeps `late` in (a late disbursement is
 *  delayed, not gone — §7.1). That difference is exactly the T7 late-vs-cancel
 *  distinction. */
function cashIncluded(t: EngineTranche): boolean {
  return (
    (t.certainty === "confirmed" || t.certainty === "likely") &&
    t.status !== "late" &&
    t.status !== "cancelled"
  );
}

export interface CashDay {
  date: ISODate;
  cashCents: number;
}

export interface CrunchPoint {
  /** First day cash dips below the buffer. */
  date: ISODate;
  /** Cash on that day (may be negative). */
  cashCents: number;
  /** buffer − cash. Measured to the buffer, the user's own "can't sleep below
   *  this" line, not to zero (§6.1). */
  shortfallCents: number;
  /** First day at/after the crunch where cash climbs back to the buffer, or null
   *  if it never recovers within the horizon. */
  clearsOn: ISODate | null;
}

export interface CashProjection {
  /** Day-by-day account balance across the whole horizon. */
  series: CashDay[];
  /** The FIRST crunch point only (§6.1). Null when there is none — or when the
   *  plan is in solvency deficit, where the deficit banner speaks instead and we
   *  never show both at once (§6.3, T7b). */
  crunch: CrunchPoint | null;
  /** Σ net of tranches marked `late` — money the pool still counts but that
   *  hasn't landed. Drives the "$X at risk" warning (§7.1, T7a). */
  atRiskCents: number;
}

/** Cash on a specific date, for callers/tests that want a single day. */
export function cashOn(projection: CashProjection, date: ISODate): number {
  const hit = projection.series.find((d) => d.date === date);
  return hit ? hit.cashCents : 0;
}

export function projectCash(
  input: EngineInput,
  asOf: ISODate = input.plan.startDate,
): CashProjection {
  const { plan } = input;
  const start = plan.startDate;
  const end = plan.endDate;
  const buffer = input.bufferCents ?? 0;

  // Only spendable assets are liquid; the emergency fund is out of the picture.
  const spendableToday = composePool(input).spendableAssetsCents;

  // Net per-day deltas. Inflows (tranches) and outflows (obligation occurrences +
  // S2S spends). Same-day precedence falls out naturally: both use "<= d", so an
  // inflow and an obligation dated the same day net together (C5). Program spends
  // are NOT subtracted separately — they're the payment of an obligation already
  // counted by its occurrence schedule (see T8's projection).
  const delta = new Map<ISODate, number>();
  const bump = (date: ISODate, amount: number) => {
    const d = date < start ? start : date; // a pre-start arrival is liquid at start
    delta.set(d, (delta.get(d) ?? 0) + amount);
  };

  let atRiskCents = 0;
  for (const t of input.tranches ?? []) {
    const net = deriveTranche(t).netCents;
    if (t.status === "late") atRiskCents += net;
    if (cashIncluded(t)) bump(t.date, net);
  }

  for (const prog of input.programs) {
    const cancelled =
      prog.status === "cancelled" ? prog.cancelledOn ?? start : undefined;
    for (const d of occurrencesFor(prog, plan)) {
      if (cancelled && d >= cancelled) continue;
      bump(d, -prog.amountPerOccurrenceCents);
    }
  }

  for (const s of input.spends) {
    if (s.type === "s2s") bump(s.date, -s.amountCents);
  }

  // Walk the horizon, accumulating.
  const series: CashDay[] = [];
  let running = spendableToday;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    running += delta.get(d) ?? 0;
    series.push({ date: d, cashCents: running });
  }

  // First crunch = first day below buffer.
  let crunch: CrunchPoint | null = null;
  const firstIdx = series.findIndex((day) => day.cashCents < buffer);
  if (firstIdx !== -1) {
    const day = series[firstIdx];
    let clearsOn: ISODate | null = null;
    for (let j = firstIdx + 1; j < series.length; j++) {
      if (series[j].cashCents >= buffer) {
        clearsOn = series[j].date;
        break;
      }
    }
    crunch = {
      date: day.date,
      cashCents: day.cashCents,
      shortfallCents: buffer - day.cashCents,
      clearsOn,
    };
  }

  // §6.3: a crunch (timing) and a deficit (solvency) are distinct states, never
  // shown together. When the plan doesn't add up at all, the deficit banner owns
  // the message and the crunch is suppressed.
  if (crunch && computePlanState(input, asOf).isDeficit) {
    crunch = null;
  }

  return { series, crunch, atRiskCents };
}
