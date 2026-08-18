import { describe, it, expect } from "vitest";
import { memberState, memberCash, householdCash } from "../household";
import { cashOn } from "../liquidity";
import { addDays } from "../dates";
import type { Household } from "../household";
import type { EngineProgramSpend, ISODate } from "../types";

// T11 (spec Part 10) — 🔒 advances move liquidity, not pool. And a household can
// be solvent while a member is not, so both evaluations must run.

const HORIZON = { startDate: "2026-09-01", endDate: "2026-12-31" }; // 122 days

const rent = (): EngineProgramSpend => ({
  id: "rent",
  name: "Rent",
  isRecurring: true,
  amountPerOccurrenceCents: 240_000,
  recurrence: { freq: "monthly", anchorDay: 1 },
});

const base = (advances: Household["advances"] = []): Household => ({
  ...HORIZON,
  members: [
    {
      id: "ana",
      assets: [{ balanceCents: 60_000, spendable: true }],
      tranches: [
        {
          id: "loan",
          grossCents: 1_840_000,
          feesCents: 0,
          passthroughCents: 0,
          date: "2026-09-12",
          certainty: "confirmed",
        },
      ],
      bufferCents: 0,
      personalObligations: [],
      spends: [],
    },
    {
      id: "partner",
      assets: [{ balanceCents: 900_000, spendable: true }],
      tranches: [],
      bufferCents: 0,
      personalObligations: [],
      spends: [],
    },
  ],
  sharedObligations: [{ program: rent(), rule: { type: "equal", config: {} } }],
  advances,
});

describe("T11 — advances move liquidity, not pool", () => {
  it("splits the shared rent and gives each member their own daily", () => {
    const h = base();
    const ana = memberState(h, "ana", HORIZON.startDate);
    const partner = memberState(h, "partner", HORIZON.startDate);
    expect(ana.snapshot.poolWithInflowsCents).toBe(1_900_000);
    expect(ana.baselineCents).toBe(11_639); // floor((1,900,000 − 480,000) / 122)
    expect(partner.snapshot.poolWithInflowsCents).toBe(900_000);
    expect(partner.baselineCents).toBe(3_442); // floor((900,000 − 480,000) / 122)
  });

  it("🔒 the household is solvent on Sep 1 while Ana is not — both are evaluated", () => {
    const h = base();
    expect(cashOn(memberCash(h, "ana"), "2026-09-01")).toBe(-60_000); // crunch
    expect(cashOn(memberCash(h, "partner"), "2026-09-01")).toBe(780_000);
    expect(cashOn(householdCash(h), "2026-09-01" as ISODate)).toBe(720_000);
    expect(memberCash(h, "ana").crunch).not.toBeNull();
    expect(householdCash(h).crunch).toBeNull(); // household is fine
  });

  it("an advance clears Ana's crunch without moving either pool or daily", () => {
    const before = base();
    const after = base([
      {
        fromMemberId: "partner",
        toMemberId: "ana",
        amountCents: 60_000,
        date: "2026-09-01",
        expectedSettleDate: "2026-09-12",
        status: "open",
      },
    ]);

    // pool + daily unchanged for both members
    for (const id of ["ana", "partner"]) {
      expect(memberState(after, id).baselineCents).toBe(
        memberState(before, id).baselineCents,
      );
      expect(memberState(after, id).snapshot.poolWithInflowsCents).toBe(
        memberState(before, id).snapshot.poolWithInflowsCents,
      );
    }

    // liquidity moves: Ana +60k Sep 1 (no crunch at buffer 0), Partner −60k
    expect(cashOn(memberCash(after, "ana"), "2026-09-01")).toBe(0);
    expect(cashOn(memberCash(after, "partner"), "2026-09-01")).toBe(720_000);
    expect(memberCash(after, "ana").crunch).toBeNull();

    // and it reverses on the settle date
    expect(cashOn(memberCash(after, "ana"), "2026-09-12")).toBe(1_780_000);
  });

  it("property — no sequence of advances changes any member's daily on any day", () => {
    const advances: Household["advances"] = [
      { fromMemberId: "partner", toMemberId: "ana", amountCents: 40_000, date: "2026-09-05", expectedSettleDate: "2026-10-01", status: "open" },
      { fromMemberId: "ana", toMemberId: "partner", amountCents: 25_000, date: "2026-11-02", expectedSettleDate: null, status: "open" },
    ];
    const before = base();
    const after = base(advances);
    for (let d = HORIZON.startDate; d <= HORIZON.endDate; d = addDays(d, 1)) {
      for (const id of ["ana", "partner"]) {
        expect(memberState(after, id, d).baselineCents).toBe(
          memberState(before, id, d).baselineCents,
        );
      }
    }
  });
});
