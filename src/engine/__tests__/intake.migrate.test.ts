import { describe, it, expect } from "vitest";
import { computePlanState } from "../compute";
import {
  migratePlan,
  migratedEngineInput,
  assertPoolInvariant,
  PoolInvariantError,
  type LegacyPlan,
  type MigratedHousehold,
} from "../migrate";
import { addDays } from "../dates";
import type { EngineInput, EngineProgramSpend, ISODate } from "../types";

// Migration gate (spec Part 10, T13) + the B1 blocker. Refined for the
// steady-number decision: "bit-identical before/after" holds for the pool seed
// (a plan with no logged income), while a plan WITH future-dated income migrates
// to the steady result — the income no longer spikes the daily when it lands.

const HORIZON = { startDate: "2026-09-01", endDate: "2026-12-31" };

const RENT: EngineProgramSpend = {
  id: "rent",
  name: "Rent",
  isRecurring: true,
  amountPerOccurrenceCents: 240_000,
  recurrence: { freq: "monthly", anchorDay: 1 },
};

const eachDay = (start: ISODate, end: ISODate): ISODate[] => {
  const days: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
};

// The legacy engine input: scalar pool + date-gated inflows (today's behavior).
const legacyEngineInput = (legacy: LegacyPlan): EngineInput => ({
  plan: {
    poolCents: legacy.poolAmountCents,
    startDate: legacy.startDate,
    endDate: legacy.endDate,
  },
  programs: legacy.programs,
  spends: legacy.spends ?? [],
  inflows: legacy.incomes.map((i) => ({ date: i.date, amountCents: i.amountCents })),
});

// ── T13a — a plan with no income migrates output-neutrally ───────────────────
describe("T13a — pool → asset is bit-identical when there's no logged income", () => {
  const legacy: LegacyPlan = {
    poolAmountCents: 816_000,
    ...HORIZON,
    incomes: [],
    programs: [RENT],
    spends: [{ id: "big", date: "2026-09-05", amountCents: 900_000, type: "s2s" }],
  };
  const migInput = migratedEngineInput(legacy, migratePlan(legacy));
  const legInput = legacyEngineInput(legacy);

  it("matches the legacy daily and S2S balance for every day of the horizon", () => {
    for (const day of eachDay(HORIZON.startDate, HORIZON.endDate)) {
      const a = computePlanState(legInput, day);
      const b = computePlanState(migInput, day);
      expect(b.baselineCents).toBe(a.baselineCents);
      expect(b.s2sBalanceCents).toBe(a.s2sBalanceCents);
      expect(b.isDeficit).toBe(a.isDeficit);
    }
  });
});

// ── T13b — a plan with income migrates to the steady result ──────────────────
describe("T13b — logged income becomes a received tranche; no spike when it lands", () => {
  const legacy: LegacyPlan = {
    poolAmountCents: 816_000,
    ...HORIZON,
    incomes: [{ amountCents: 150_000, date: "2026-10-01" }],
    programs: [RENT],
    spends: [],
  };
  const migInput = migratedEngineInput(legacy, migratePlan(legacy));
  const legInput = legacyEngineInput(legacy);

  const legP = (d: ISODate) =>
    computePlanState(legInput, d).snapshot.poolWithInflowsCents;
  const migP = (d: ISODate) =>
    computePlanState(migInput, d).snapshot.poolWithInflowsCents;

  it("counts the income in the pool from day one", () => {
    expect(legP("2026-09-01")).toBe(816_000); // legacy: not yet landed
    expect(migP("2026-09-01")).toBe(966_000); // migrated: 816k + 150k, steady
  });

  it("removes the spike: legacy pool jumps by the income; migrated stays flat", () => {
    // Legacy pool leaps by exactly the income the day after it lands...
    expect(legP("2026-10-02") - legP("2026-10-01")).toBe(150_000);
    // ...while the migrated pool never moves for it.
    expect(migP("2026-10-01")).toBe(966_000);
    expect(migP("2026-10-02")).toBe(966_000);
  });
});

// ── T13c — 🔴 B1 guard: income is preserved, never double-counted ────────────
describe("T13c — the migration conserves money and refuses to double-count", () => {
  const legacy: LegacyPlan = {
    poolAmountCents: 816_000,
    ...HORIZON,
    incomes: [{ amountCents: 150_000, date: "2026-10-01" }],
    programs: [RENT],
  };
  const migrated = migratePlan(legacy);

  it("maps the pool to the asset and income to tranches, losing nothing", () => {
    expect(migrated.asset.balanceCents).toBe(816_000); // pool only
    expect(migrated.tranches).toHaveLength(1);
    expect(migrated.tranches[0].grossCents).toBe(150_000); // income preserved
    expect(migrated.tranches[0].status).toBe("received");
  });

  it("throws if the pool ever absorbed income (double-count guard)", () => {
    // Simulate the corruption B1 warns about: an asset inflated by the income.
    const doubleCounted: MigratedHousehold = {
      ...migrated,
      asset: { ...migrated.asset, balanceCents: 966_000 },
    };
    expect(() => assertPoolInvariant(legacy, doubleCounted)).toThrow(
      PoolInvariantError,
    );
  });
});
