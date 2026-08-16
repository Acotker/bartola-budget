import {
  computePlanState,
  occurrencesFor,
  daysInclusive,
  type EngineInput,
  type EngineSpendEntry,
  type PlanState,
} from "@/engine";
import { MARIA_PLAN, MARIA_PROGRAMS } from "@/engine/fixtures/maria";

/**
 * The seeded "Maria" demo (brief §9) so the app is explorable without setup.
 * A fixed "today" inside the runway with a few days of real activity, so the
 * hero number reflects accumulated Safe-to-Spend rather than a cold start.
 */
export const DEMO_TODAY = "2026-09-10";

const DEMO_SPENDS: EngineSpendEntry[] = [
  { id: "rent-sep", date: "2026-09-01", amountCents: 150_000, type: "program", programSpendId: "rent" },
  { id: "groc-1", date: "2026-09-01", amountCents: 12_000, type: "program", programSpendId: "groceries" },
  { id: "groc-2", date: "2026-09-08", amountCents: 15_000, type: "program", programSpendId: "groceries" },
  { id: "coffee-1", date: "2026-09-02", amountCents: 650, type: "s2s", note: "Coffee" },
  { id: "lunch-1", date: "2026-09-03", amountCents: 1_200, type: "s2s", note: "Lunch" },
  { id: "misc-1", date: "2026-09-05", amountCents: 800, type: "s2s" },
  { id: "misc-2", date: "2026-09-07", amountCents: 450, type: "s2s" },
  { id: "misc-3", date: "2026-09-09", amountCents: 2_200, type: "s2s", note: "Dinner out" },
];

export interface UpcomingOccurrence {
  date: string;
  name: string;
  amountCents: number;
}

export interface DemoView {
  state: PlanState;
  planStart: string;
  planEnd: string;
  asOf: string;
  daysRemaining: number;
  upcoming: UpcomingOccurrence[];
}

export function getDemoView(): DemoView {
  const input: EngineInput = {
    plan: MARIA_PLAN,
    programs: MARIA_PROGRAMS,
    spends: DEMO_SPENDS,
  };
  const state = computePlanState(input, DEMO_TODAY);
  const daysRemaining = daysInclusive(DEMO_TODAY, MARIA_PLAN.endDate);

  const upcoming = MARIA_PROGRAMS.flatMap((p) =>
    occurrencesFor(p, MARIA_PLAN)
      .filter((d) => d > DEMO_TODAY)
      .map((d) => ({ date: d, name: p.name, amountCents: p.amountPerOccurrenceCents })),
  )
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 5);

  return {
    state,
    planStart: MARIA_PLAN.startDate,
    planEnd: MARIA_PLAN.endDate,
    asOf: DEMO_TODAY,
    daysRemaining,
    upcoming,
  };
}
