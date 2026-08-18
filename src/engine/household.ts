// Household composition (spec Part 8, E5/E6). Two (or more) members, each with
// their own pool and personal number, sharing some costs.
//
// The design point (§4.1): the rate engine never learns about "shared". A shared
// obligation is split into a per-member reservation, and each member's own pool
// absorbs its share exactly like a personal obligation. So a member's Safe-to-
// Spend is just computePlanState on an input we assemble here. Advances move
// liquidity only (E6) — they touch the cash projection, never the pool or daily.

import { computePlanState } from "./compute";
import {
  projectCash,
  type CashDay,
  type CashProjection,
  type CrunchPoint,
} from "./liquidity";
import { occurrencesFor } from "./occurrences";
import { splitAmount, type SplitRule } from "./split";
import type {
  EngineAsset,
  EngineInput,
  EngineProgramSpend,
  EngineSpendEntry,
  EngineTranche,
  ISODate,
  PlanState,
} from "./types";

export interface HouseholdMember {
  id: string;
  assets: EngineAsset[];
  tranches: EngineTranche[];
  bufferCents: number;
  personalObligations: EngineProgramSpend[];
  spends: EngineSpendEntry[];
}

export interface SharedObligation {
  /** The full shared cost. Its `amountPerOccurrenceCents` is split by `rule`.
   *  A `kind: "shared_discretionary"` program (§8.1) is the shared Safe-to-Spend
   *  bucket — an ordinary reservation whose surplus accrues and is spendable. */
  program: EngineProgramSpend;
  rule: SplitRule;
}

/** A spend logged against a shared bucket, by one member. */
export interface SharedSpend {
  memberId: string;
  sharedObligationId: string;
  date: ISODate;
  amountCents: number;
}

export interface Advance {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  date: ISODate;
  expectedSettleDate?: ISODate | null;
  status: "open" | "settled";
}

export interface Household {
  startDate: ISODate;
  endDate: ISODate;
  members: HouseholdMember[];
  sharedObligations: SharedObligation[];
  advances?: Advance[];
  sharedSpends?: SharedSpend[];
  /** When true, a shared-bucket overage is re-attributed across members by the
   *  obligation's split rule (the "split this" tap, §8.1) instead of resting
   *  entirely on whoever logged it. */
  splitSharedOverage?: boolean;
}

const allMemberIds = (h: Household) => h.members.map((m) => m.id);

const planOf = (h: Household) => ({
  poolCents: 0,
  startDate: h.startDate,
  endDate: h.endDate,
});

/** Current balance of a shared bucket (§8.1): everything reserved up to `asOf`
 *  minus everything spent against it. Surplus accrues and stays spendable. */
export function sharedBucketBalance(
  h: Household,
  sharedObligationId: string,
  asOf: ISODate = h.startDate,
): number {
  const shared = h.sharedObligations.find(
    (s) => s.program.id === sharedObligationId,
  );
  if (!shared) return 0;
  const reserved =
    occurrencesFor(shared.program, planOf(h)).filter((d) => d <= asOf).length *
    shared.program.amountPerOccurrenceCents;
  const spent = (h.sharedSpends ?? [])
    .filter((s) => s.sharedObligationId === sharedObligationId && s.date <= asOf)
    .reduce((sum, s) => sum + s.amountCents, 0);
  return reserved - spent;
}

interface OverageContribution {
  programs: EngineProgramSpend[];
  spends: EngineSpendEntry[];
}

/** Per-member overage from shared buckets going negative. When a logged spend
 *  drives a bucket below 0, that marginal overage is attributed to the logging
 *  member (§8.1) — or split across members when `splitSharedOverage` is set.
 *
 *  It's modeled as a zero-reservation one-time obligation the member overspends,
 *  so it eases their daily through the existing forward-only recalc (unlike an
 *  S2S spend, which the member could just absorb from banked allowance without
 *  changing the rate). Everyone else's daily is untouched. */
function sharedOverage(h: Household): Record<string, OverageContribution> {
  const ids = allMemberIds(h);
  const out: Record<string, OverageContribution> = {};
  for (const id of ids) out[id] = { programs: [], spends: [] };

  const attribute = (
    memberId: string,
    key: string,
    date: ISODate,
    amountCents: number,
  ) => {
    const progId = `ov-${key}-${memberId}`;
    out[memberId].programs.push({
      id: progId,
      name: "Shared overage",
      isRecurring: false,
      amountPerOccurrenceCents: 0,
      targetDate: date,
      addedOn: date,
    });
    out[memberId].spends.push({
      id: `${progId}-spend`,
      date,
      amountCents,
      type: "program",
      programSpendId: progId,
    });
  };

  for (const shared of h.sharedObligations) {
    const occ = occurrencesFor(shared.program, planOf(h));
    const spends = (h.sharedSpends ?? [])
      .filter((s) => s.sharedObligationId === shared.program.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    let cumulative = 0;
    let prevNeg = 0;
    for (const s of spends) {
      const reserved =
        occ.filter((d) => d <= s.date).length *
        shared.program.amountPerOccurrenceCents;
      cumulative += s.amountCents;
      const negAfter = Math.max(0, cumulative - reserved);
      const overage = negAfter - prevNeg; // marginal overage from this spend
      prevNeg = negAfter;
      if (overage <= 0) continue;
      const key = `${shared.program.id}-${s.date}`;
      if (h.splitSharedOverage) {
        for (const sh of splitAmount(overage, shared.rule, ids)) {
          if (sh.amountCents > 0)
            attribute(sh.memberId, key, s.date, sh.amountCents);
        }
      } else {
        attribute(s.memberId, key, s.date, overage);
      }
    }
  }
  return out;
}

/** A member's share of one shared obligation, per occurrence (C6 split). */
export function sharedShareCents(
  shared: SharedObligation,
  memberId: string,
  memberIds: string[],
): number {
  return (
    splitAmount(shared.program.amountPerOccurrenceCents, shared.rule, memberIds).find(
      (s) => s.memberId === memberId,
    )?.amountCents ?? 0
  );
}

/** E5: the member's engine input — own pool + personal obligations + a per-member
 *  reservation for each shared obligation. No "shared" concept reaches the engine. */
export function memberEngineInput(h: Household, memberId: string): EngineInput {
  const m = h.members.find((x) => x.id === memberId);
  if (!m) throw new Error(`unknown member ${memberId}`);
  const ids = allMemberIds(h);

  const sharedShares: EngineProgramSpend[] = h.sharedObligations.map((s) => ({
    ...s.program,
    id: `${s.program.id}__${memberId}`,
    amountPerOccurrenceCents: sharedShareCents(s, memberId, ids),
  }));

  // Overage from shared buckets this member is on the hook for (§8.1) — a
  // zero-reservation obligation they overspend, so their daily eases via the
  // existing forward-only recalc.
  const overage = sharedOverage(h)[memberId] ?? { programs: [], spends: [] };

  return {
    plan: { poolCents: 0, startDate: h.startDate, endDate: h.endDate },
    programs: [...m.personalObligations, ...sharedShares, ...overage.programs],
    spends: [...m.spends, ...overage.spends],
    bufferCents: m.bufferCents,
    assets: m.assets,
    tranches: m.tranches,
  };
}

/** A member's personal Safe-to-Spend state. Invariant to advances by
 *  construction — the input carries no advance. */
export function memberState(
  h: Household,
  memberId: string,
  asOf: ISODate = h.startDate,
): PlanState {
  return computePlanState(memberEngineInput(h, memberId), asOf);
}

/** Advance cash events from `memberId`'s view: they lose cash when they give and
 *  gain when they receive, reversed at the expected settle date (E6). */
function advanceEvents(
  h: Household,
  memberId: string,
): { date: ISODate; amountCents: number }[] {
  const events: { date: ISODate; amountCents: number }[] = [];
  for (const a of h.advances ?? []) {
    const settle = a.expectedSettleDate ?? null;
    if (a.fromMemberId === memberId) {
      events.push({ date: a.date, amountCents: -a.amountCents });
      if (settle) events.push({ date: settle, amountCents: a.amountCents });
    } else if (a.toMemberId === memberId) {
      events.push({ date: a.date, amountCents: a.amountCents });
      if (settle) events.push({ date: settle, amountCents: -a.amountCents });
    }
  }
  return events;
}

/** A member's cash projection, including advances (liquidity only). */
export function memberCash(
  h: Household,
  memberId: string,
  asOf: ISODate = h.startDate,
): CashProjection {
  return projectCash(memberEngineInput(h, memberId), asOf, {
    extraCashEvents: advanceEvents(h, memberId),
  });
}

/** Household liquidity = the sum of every member's cash, day by day, against the
 *  summed buffers. 🔒 A household can be solvent while a member is not (§6.1),
 *  so callers must evaluate BOTH this and each member's cash. */
export function householdCash(
  h: Household,
  asOf: ISODate = h.startDate,
): { series: CashDay[]; crunch: CrunchPoint | null } {
  const perMember = h.members.map((m) => memberCash(h, m.id, asOf).series);
  const dates = perMember[0]?.map((d) => d.date) ?? [];
  const buffer = h.members.reduce((s, m) => s + m.bufferCents, 0);

  const series: CashDay[] = dates.map((date, i) => ({
    date,
    cashCents: perMember.reduce((s, ms) => s + (ms[i]?.cashCents ?? 0), 0),
  }));

  let crunch: CrunchPoint | null = null;
  const idx = series.findIndex((d) => d.cashCents < buffer);
  if (idx !== -1) {
    const day = series[idx];
    let clearsOn: ISODate | null = null;
    for (let j = idx + 1; j < series.length; j++) {
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
  return { series, crunch };
}
