// Splitting a shared cost across household members (spec §3.6, C6, T9/T10).
//
// The engine never needs to understand "shared": a shared obligation is split
// into a per-member reservation, and each member's own pool absorbs its share
// exactly like any personal obligation (§4.1). This module is the splitter.
//
// Allocation is the LARGEST REMAINDER METHOD (C6): floor every share, then hand
// out the leftover cents one at a time in descending order of fractional part,
// ties broken by ascending member id. Invariant: Σ shares == amount, always.
// Integer/BigInt math throughout, so it's exact for any weights.

import type { ISODate } from "./types";

export type SplitType =
  | "equal"
  | "fixed_amounts"
  | "custom_percent"
  | "single_payer";

export interface SplitRule {
  type: SplitType;
  config: {
    /** custom_percent: relative weights per member (any scale — shares are
     *  weight_i / Σweights). Proportional calculators resolve INTO this. */
    weights?: Record<string, number>;
    /** fixed_amounts: exact cents per member. */
    amounts?: Record<string, number>;
    /** single_payer: the member who covers the whole cost. */
    payer?: string;
  };
}

export interface SplitShare {
  memberId: string;
  amountCents: number;
}

export function splitAmount(
  amountCents: number,
  rule: SplitRule,
  memberIds: string[],
): SplitShare[] {
  const ids = [...memberIds].sort(); // ascending id — the tie-break order (C6)
  const amount = Math.max(0, Math.round(amountCents));

  // fixed_amounts is authoritative as configured; no remainder to distribute.
  if (rule.type === "fixed_amounts") {
    return ids.map((id) => ({
      memberId: id,
      amountCents: Math.max(0, Math.round(rule.config.amounts?.[id] ?? 0)),
    }));
  }

  // Everything else reduces to weights.
  let weights: Record<string, number>;
  if (rule.type === "equal") {
    weights = Object.fromEntries(ids.map((id) => [id, 1]));
  } else if (rule.type === "single_payer") {
    weights = Object.fromEntries(
      ids.map((id) => [id, id === rule.config.payer ? 1 : 0]),
    );
  } else {
    weights = rule.config.weights ?? Object.fromEntries(ids.map((id) => [id, 1]));
  }

  const totalW = ids.reduce((s, id) => s + Math.max(0, weights[id] ?? 0), 0);
  if (totalW <= 0) return ids.map((id) => ({ memberId: id, amountCents: 0 }));

  const amt = BigInt(amount);
  const tW = BigInt(totalW);
  const rows = ids.map((id) => {
    const num = amt * BigInt(Math.max(0, weights[id] ?? 0));
    return { id, floor: Number(num / tW), rem: num % tW };
  });

  let leftover = amount - rows.reduce((s, r) => s + r.floor, 0);
  // Largest remainder first; ties → ascending id (rows already in id order).
  const order = [...rows].sort((a, b) => {
    if (a.rem !== b.rem) return a.rem > b.rem ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  const bumped = new Set<string>();
  for (const r of order) {
    if (leftover <= 0) break;
    bumped.add(r.id);
    leftover -= 1;
  }

  return rows.map((r) => ({
    memberId: r.id,
    amountCents: r.floor + (bumped.has(r.id) ? 1 : 0),
  }));
}

// ── Proportional calculators resolve ONCE and freeze (§3.6, T10) ─────────────
// `proportional_to_pool` / `proportional_to_inflow` are setup-time calculators,
// not stored rule types. They resolve into a custom_percent whose weights are a
// SNAPSHOT of the source amounts, so the split never moves when a pool later
// changes — only an explicit renegotiation re-resolves it.

export interface DerivedFrom {
  type: "proportional_to_pool" | "proportional_to_inflow";
  snapshot: Record<string, number>;
  resolvedAt: ISODate;
}

export function resolveProportional(
  kind: DerivedFrom["type"],
  snapshot: Record<string, number>,
  resolvedAt: ISODate,
): { rule: SplitRule; derivedFrom: DerivedFrom } {
  return {
    rule: { type: "custom_percent", config: { weights: { ...snapshot } } },
    derivedFrom: { type: kind, snapshot: { ...snapshot }, resolvedAt },
  };
}
