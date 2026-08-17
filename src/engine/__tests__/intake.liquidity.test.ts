import { describe, it, expect } from "vitest";
import { computePlanState } from "../compute";
import { projectCash, cashOn } from "../liquidity";
import type {
  EngineInput,
  EngineProgramSpend,
  EngineTranche,
} from "../types";

// Golden cases for the cash projection and crunch points (spec Part 10, T5–T7).

const HORIZON = { startDate: "2026-09-01", endDate: "2026-12-31" }; // 122 days

const RENT: EngineProgramSpend = {
  id: "rent",
  name: "Rent",
  isRecurring: true,
  amountPerOccurrenceCents: 240_000,
  recurrence: { freq: "monthly", anchorDay: 1 },
};

// Base scenario shared by T5–T7: $1,800 spendable, a $18,400 tranche, rent.
const baseTranche: EngineTranche = {
  id: "T-A",
  grossCents: 1_840_000,
  feesCents: 0,
  passthroughCents: 0,
  date: "2026-09-12",
  certainty: "confirmed",
};

const scenario = (tranche: EngineTranche): EngineInput => ({
  plan: { poolCents: 0, ...HORIZON },
  programs: [RENT],
  spends: [],
  bufferCents: 30_000,
  assets: [{ balanceCents: 180_000, spendable: true }],
  tranches: [tranche],
});

// ── T5 — crunch point detected, daily allowance untouched ────────────────────
describe("T5 — a crunch point never caps the daily", () => {
  const input = scenario(baseTranche);

  it("projects cash day by day", () => {
    const p = projectCash(input);
    expect(cashOn(p, "2026-09-01")).toBe(-60_000); // 180k − 240k rent
    expect(cashOn(p, "2026-09-11")).toBe(-60_000);
    expect(cashOn(p, "2026-09-12")).toBe(1_780_000); // tranche lands
    expect(cashOn(p, "2026-10-01")).toBe(1_540_000); // 180k + 1.84M − 480k
    expect(cashOn(p, "2026-12-01")).toBe(1_060_000);
    expect(cashOn(p, "2026-12-31")).toBe(1_060_000);
  });

  it("reports the first crunch, measured to the buffer", () => {
    const { crunch } = projectCash(input);
    expect(crunch).not.toBeNull();
    expect(crunch!.date).toBe("2026-09-01");
    expect(crunch!.cashCents).toBe(-60_000);
    expect(crunch!.shortfallCents).toBe(90_000); // buffer 30k − (−60k)
    expect(crunch!.clearsOn).toBe("2026-09-12");
  });

  it("🔒 leaves the daily allowance uncapped while the crunch exists", () => {
    const state = computePlanState(input, "2026-09-01");
    expect(state.snapshot.poolWithInflowsCents).toBe(2_020_000); // pool_projected
    expect(state.snapshot.unallocatedRemainderCents).toBe(1_030_000); // free
    expect(state.baselineCents).toBe(8_442); // floor(1,030,000 / 122), rem 76
    expect(state.isDeficit).toBe(false);
  });
});

// ── T6 — same-day precedence (C5) ────────────────────────────────────────────
describe("T6 — an inflow counts before an obligation on the same day", () => {
  it("tranche on 09-01: no crunch (inflow nets against rent same day)", () => {
    const { crunch } = projectCash(
      scenario({ ...baseTranche, date: "2026-09-01" }),
    );
    expect(crunch).toBeNull();
  });

  it("tranche on 09-02: crunch on 09-01 only, clears 09-02", () => {
    const p = projectCash(scenario({ ...baseTranche, date: "2026-09-02" }));
    expect(cashOn(p, "2026-09-01")).toBe(-60_000);
    expect(p.crunch!.date).toBe("2026-09-01");
    expect(p.crunch!.clearsOn).toBe("2026-09-02"); // window is Sep 1 only
  });

  it("tranche on 09-12: crunch window Sep 1 – Sep 11 (= T5)", () => {
    const { crunch } = projectCash(scenario(baseTranche));
    expect(crunch!.date).toBe("2026-09-01");
    expect(crunch!.clearsOn).toBe("2026-09-12");
  });
});

// ── T7 — late ≠ cancelled ────────────────────────────────────────────────────
describe("T7 — a late tranche stays in the pool; a cancelled one leaves it", () => {
  it("7a: late — pool and daily unchanged, cash treats it as not received", () => {
    const input = scenario({ ...baseTranche, status: "late" });
    const state = computePlanState(input, "2026-09-17");
    expect(state.snapshot.poolWithInflowsCents).toBe(2_020_000); // UNCHANGED
    expect(state.baselineCents).toBe(8_442); // UNCHANGED
    expect(state.isDeficit).toBe(false);

    const p = projectCash(input);
    expect(p.atRiskCents).toBe(1_840_000);
    expect(cashOn(p, "2026-09-17")).toBe(-60_000); // tranche excluded from cash
    expect(p.crunch).not.toBeNull(); // liquidity crunch, ongoing
    expect(p.crunch!.clearsOn).toBeNull(); // never arrives -> never clears
  });

  it("7b: cancelled — pool drops, plan is a deficit, crunch is suppressed", () => {
    const input = scenario({ ...baseTranche, status: "cancelled" });
    const state = computePlanState(input, "2026-09-17");
    expect(state.snapshot.poolWithInflowsCents).toBe(180_000); // tranche gone
    expect(state.snapshot.unallocatedRemainderCents).toBe(-810_000); // free
    expect(state.isDeficit).toBe(true); // solvency deficit

    const { crunch } = projectCash(input);
    expect(crunch).toBeNull(); // §6.3 — deficit banner speaks, not a crunch
  });
});
