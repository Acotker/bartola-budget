// Demo-only fixture for the public landing page's interactive demo (spec §5).
// Reuses the "Maria" scenario already exercised by the engine test suite —
// same numbers as the product, zero risk of the marketing page drifting from
// what the engine would actually produce. `asOf` is a fixed ISO string (not
// derived from `new Date()`), so the demo renders identically forever.
import { MARIA_PLAN, MARIA_PROGRAMS } from "./maria";
import { computePlanState } from "../compute";
import type { EngineInput, EngineSpendEntry } from "../types";

export const LANDING_DEMO_ASOF = MARIA_PLAN.startDate; // "2026-09-01"
export const LANDING_DEMO_DINNER_CENTS = 4_500; // $45

export const LANDING_DEMO_FIXTURE: EngineInput = {
  plan: MARIA_PLAN,
  programs: MARIA_PROGRAMS,
  spends: [],
};

/**
 * Safe-to-spend for the demo card, optionally after logging the $45 dinner.
 * Pure and deterministic — the same function backs both the UI and the tests
 * that prove the numbers it shows are real.
 */
export function landingDemoSafeToSpendCents(spendCents = 0): number {
  const spends: EngineSpendEntry[] = spendCents > 0
    ? [{ id: "demo-dinner", date: LANDING_DEMO_ASOF, amountCents: spendCents, type: "s2s" }]
    : [];
  const input: EngineInput = { ...LANDING_DEMO_FIXTURE, spends };
  return computePlanState(input, LANDING_DEMO_ASOF).s2sBalanceCents;
}
