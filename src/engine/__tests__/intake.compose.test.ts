import { describe, it, expect } from "vitest";
import { computePlanState } from "../compute";
import {
  deriveTranche,
  composePool,
  validateComposition,
  ValidationError,
} from "../intake";
import { addDays } from "../dates";
import type {
  EngineInput,
  EngineTranche,
  EngineProgramSpend,
  EngineSpendEntry,
  ISODate,
} from "../types";

// Golden cases for the composed pool (spec Part 10, T1–T4). Worked to the cent.
// All amounts are integer cents; the daily is floored (convention C2).

const HORIZON = { startDate: "2026-09-01", endDate: "2026-12-31" }; // 122 days

const eachDay = (start: ISODate, end: ISODate): ISODate[] => {
  const days: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
};

// ── T1 — Full pool composition ───────────────────────────────────────────────
describe("T1 — full pool composition", () => {
  const TA: EngineTranche = {
    id: "T-A",
    grossCents: 3_200_000,
    passthroughCents: 2_850_000,
    feesCents: 84_000,
    date: "2026-09-03",
    certainty: "confirmed",
  };
  const TB: EngineTranche = {
    id: "T-B",
    grossCents: 150_000,
    passthroughCents: 0,
    feesCents: 0,
    date: "2026-11-01",
    certainty: "confirmed",
  };
  const TC: EngineTranche = {
    id: "T-C",
    grossCents: 200_000,
    passthroughCents: 0,
    feesCents: 0,
    date: "2026-10-15",
    certainty: "hoped",
  };

  const input: EngineInput = {
    plan: { poolCents: 0, ...HORIZON },
    programs: [],
    spends: [],
    bufferCents: 50_000,
    assets: [
      { balanceCents: 400_000, spendable: true }, // Chase checking
      { balanceCents: 600_000, spendable: false }, // Emergency HYSA
    ],
    tranches: [TA, TB, TC],
  };

  it("derives net-of-fees/passthrough per tranche", () => {
    expect(deriveTranche(TA).netCents).toBe(266_000); // 3.2M − 2.85M − 84k
    expect(deriveTranche(TB).netCents).toBe(150_000);
    expect(deriveTranche(TC).netCents).toBe(200_000); // computed, but excluded
  });

  it("composes the pool from spendable assets + included tranches only", () => {
    const c = composePool(input);
    expect(c.spendableAssetsCents).toBe(400_000); // HYSA excluded
    expect(c.nonSpendableCents).toBe(600_000); // visible, greyed
    expect(c.includedTranchesCents).toBe(416_000); // T-A + T-B
    expect(c.upsideCents).toBe(200_000); // T-C, surfaced separately
    expect(c.poolProjectedCents).toBe(816_000);
  });

  it("produces the daily allowance evaluated 2026-09-01", () => {
    const state = computePlanState(input, "2026-09-01");
    expect(state.snapshot.poolWithInflowsCents).toBe(816_000); // P
    expect(state.snapshot.unallocatedRemainderCents).toBe(766_000); // free = pool − buffer
    expect(state.snapshot.remainingDays).toBe(122);
    expect(state.baselineCents).toBe(6_278); // floor(766,000 / 122), remainder 84
  });
});

// ── T2 — Tranche fully consumed, with a residual bill ────────────────────────
describe("T2 — tranche fully consumed leaves a residual, never a negative inflow", () => {
  const t: EngineTranche = {
    id: "consumed",
    grossCents: 3_000_000,
    passthroughCents: 2_950_000,
    feesCents: 126_000,
    date: "2026-09-03",
    certainty: "confirmed",
  };

  it("floors net at 0 and reports the residual owed", () => {
    const d = deriveTranche(t);
    expect(d.netCents).toBe(0); // max(0, −76,000)
    expect(d.fullyConsumed).toBe(true);
    expect(d.residualOwedCents).toBe(76_000); // becomes an obligation prompt
  });

  it("adds nothing to the pool (not a negative inflow)", () => {
    const c = composePool({
      plan: { poolCents: 0, ...HORIZON },
      programs: [],
      spends: [],
      tranches: [t],
    });
    expect(c.includedTranchesCents).toBe(0);
    expect(c.poolProjectedCents).toBe(0);
  });
});

// ── T3 — Buffer exceeds pool → rejected ──────────────────────────────────────
describe("T3 — buffer larger than the pool is rejected", () => {
  const base: EngineInput = {
    plan: { poolCents: 0, ...HORIZON },
    programs: [],
    spends: [],
    assets: [{ balanceCents: 200_000, spendable: true }],
    tranches: [],
  };

  it("throws a ValidationError when buffer > spendable assets + included tranches", () => {
    expect(() =>
      validateComposition({ ...base, bufferCents: 250_000 }),
    ).toThrow(ValidationError);
  });

  it("accepts a buffer equal to the pool (boundary is inclusive)", () => {
    expect(() =>
      validateComposition({ ...base, bufferCents: 200_000 }),
    ).not.toThrow();
  });
});

// ── T4 — Regression gate for E1: composed pool is output-neutral ─────────────
describe("T4 — composed pool reproduces the scalar pool bit-for-bit", () => {
  // Plan A: the old scalar model. Plan B: the same money expressed as an asset
  // plus a tranche dated at horizon start, buffer 0.
  const planA: EngineInput = {
    plan: { poolCents: 816_000, ...HORIZON },
    programs: [],
    spends: [],
  };
  const planB: EngineInput = {
    plan: { poolCents: 0, ...HORIZON },
    programs: [],
    spends: [],
    bufferCents: 0,
    assets: [{ balanceCents: 400_000, spendable: true }],
    tranches: [
      {
        id: "seed",
        grossCents: 416_000,
        feesCents: 0,
        passthroughCents: 0,
        date: "2026-09-01",
        certainty: "confirmed",
      },
    ],
  };

  it("day one daily is floor(816,000 / 122) = 6,688", () => {
    expect(computePlanState(planA, "2026-09-01").baselineCents).toBe(6_688);
    expect(computePlanState(planB, "2026-09-01").baselineCents).toBe(6_688);
  });

  it("baseline and S2S balance are identical for every day of the horizon", () => {
    for (const day of eachDay(HORIZON.startDate, HORIZON.endDate)) {
      const a = computePlanState(planA, day);
      const b = computePlanState(planB, day);
      expect(b.baselineCents).toBe(a.baselineCents);
      expect(b.s2sBalanceCents).toBe(a.s2sBalanceCents);
    }
  });

  it("stays identical through obligations and an overspend recalc", () => {
    const rent: EngineProgramSpend = {
      id: "rent",
      name: "Rent",
      isRecurring: true,
      amountPerOccurrenceCents: 240_000,
      recurrence: { freq: "monthly", anchorDay: 1 },
    };
    const spends: EngineSpendEntry[] = [
      { id: "big", date: "2026-09-05", amountCents: 900_000, type: "s2s" },
    ];
    const a = { ...planA, programs: [rent], spends };
    const b = { ...planB, programs: [rent], spends };
    for (const day of eachDay(HORIZON.startDate, HORIZON.endDate)) {
      const sa = computePlanState(a, day);
      const sb = computePlanState(b, day);
      expect(sb.baselineCents).toBe(sa.baselineCents);
      expect(sb.s2sBalanceCents).toBe(sa.s2sBalanceCents);
      expect(sb.isDeficit).toBe(sa.isDeficit);
    }
  });
});
