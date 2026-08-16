import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { occurrencesFor } from "../occurrences";
import { computePlanState, snapshotAt } from "../compute";
import type { EngineInput, EngineSpendEntry } from "../types";
import {
  MARIA_PLAN,
  MARIA_PROGRAMS,
  MARIA_RENT,
  MARIA_GROCERIES,
  MARIA_TRIPS,
} from "../fixtures/maria";

const mariaInput = (
  programs = MARIA_PROGRAMS,
  spends: EngineSpendEntry[] = [],
  extra: Partial<EngineInput> = {},
): EngineInput => ({
  plan: MARIA_PLAN,
  programs,
  spends,
  ...extra,
});

describe("occurrencesFor — recurrence projection through the runway", () => {
  it("produces the brief's Maria occurrence counts", () => {
    expect(occurrencesFor(MARIA_RENT, MARIA_PLAN)).toHaveLength(12);
    expect(occurrencesFor(MARIA_GROCERIES, MARIA_PLAN)).toHaveLength(52);
    expect(occurrencesFor(MARIA_TRIPS, MARIA_PLAN)).toHaveLength(12);
  });

  it("anchors monthly rent to the 1st", () => {
    const occ = occurrencesFor(MARIA_RENT, MARIA_PLAN);
    expect(occ[0]).toBe("2026-09-01");
    expect(occ[occ.length - 1]).toBe("2027-08-01");
  });

  it("reserves the full projected totals upfront", () => {
    const rent = occurrencesFor(MARIA_RENT, MARIA_PLAN).length * 150_000;
    const groc = occurrencesFor(MARIA_GROCERIES, MARIA_PLAN).length * 15_000;
    const trips = occurrencesFor(MARIA_TRIPS, MARIA_PLAN).length * 30_000;
    expect(rent + groc + trips).toBe(2_940_000); // $29,400
  });
});

describe("Example 1 — onboarding walk-down as programs are added", () => {
  it("steps 164.38 -> 115.07 -> 93.70 -> 83.84 as each program is added", () => {
    const base = computePlanState(mariaInput([]), "2026-09-01");
    expect(base.baselineCents).toBe(16_438); // $164.38

    const withRent = computePlanState(mariaInput([MARIA_RENT]), "2026-09-01");
    expect(withRent.baselineCents).toBe(11_507); // $115.07

    const withGroc = computePlanState(
      mariaInput([MARIA_RENT, MARIA_GROCERIES]),
      "2026-09-01",
    );
    expect(withGroc.baselineCents).toBe(9_370); // $93.70

    const full = computePlanState(mariaInput(), "2026-09-01");
    expect(full.baselineCents).toBe(8_384); // $83.84
  });
});

describe("Example 2 — a normal day: rollover, no recalc", () => {
  const spends: EngineSpendEntry[] = [
    { id: "rent1", date: "2026-09-01", amountCents: 150_000, type: "program", programSpendId: "rent" },
    { id: "groc1", date: "2026-09-01", amountCents: 12_000, type: "program", programSpendId: "groceries" },
    { id: "coffee", date: "2026-09-01", amountCents: 600, type: "s2s" },
  ];

  it("rolls unspent S2S forward and does not recalculate", () => {
    const state = computePlanState(mariaInput(MARIA_PROGRAMS, spends), "2026-09-02");
    // Baseline unchanged (no overspend).
    expect(state.baselineCents).toBe(8_384);
    // Full-precision rollover: 77.8356 carried + 83.8356 granted = 161.6712 -> $161.67.
    // (The brief prints $161.68 by summing pre-rounded displays; the engine
    //  rounds only once, at the end, per the "round only for display" rule.)
    expect(state.s2sBalanceCents).toBe(16_167);
    // Groceries keeps a $30 surplus, still spendable.
    const groc = state.buckets.find((b) => b.programSpendId === "groceries");
    expect(groc?.balanceCents).toBe(3_000);
  });
});

describe("Example 3 — S2S overspend triggers a forward recalc", () => {
  const preFlight: EngineSpendEntry[] = [
    { id: "rent1", date: "2026-09-01", amountCents: 150_000, type: "program", programSpendId: "rent" },
    { id: "groc1", date: "2026-09-01", amountCents: 12_000, type: "program", programSpendId: "groceries" },
    { id: "groc2", date: "2026-09-08", amountCents: 15_000, type: "program", programSpendId: "groceries" },
    { id: "s1", date: "2026-09-02", amountCents: 10_000, type: "s2s" },
    { id: "s2", date: "2026-09-04", amountCents: 10_000, type: "s2s" },
    { id: "s3", date: "2026-09-06", amountCents: 10_000, type: "s2s" },
    { id: "s4", date: "2026-09-08", amountCents: 10_000, type: "s2s" },
    { id: "s5", date: "2026-09-10", amountCents: 3_836, type: "s2s" },
  ];
  const flight: EngineSpendEntry = {
    id: "flight",
    date: "2026-09-10",
    amountCents: 90_000,
    type: "s2s",
  };
  const withFlight = mariaInput(MARIA_PROGRAMS, [...preFlight, flight]);
  const noFlight = mariaInput(MARIA_PROGRAMS, preFlight);

  it("reproduces the brief's snapshot to the cent", () => {
    const snap = snapshotAt(withFlight, "2026-09-11");
    expect(snap.actualSpendCents).toBe(310_836); // A
    expect(snap.availableRemainingPoolCents).toBe(5_689_164); // ARP
    expect(snap.remainingCommittedCents).toBe(2_730_000); // RC
    expect(snap.programSurplusCents).toBe(33_000); // B_prog ($330)
    expect(snap.s2sBankedCents).toBe(0); // B_s2s absorbed
    expect(snap.remainingDays).toBe(355); // RD
    expect(snap.unallocatedRemainderCents).toBe(2_926_164); // UR
    expect(snap.baselineCents).toBe(8_243); // $82.43
  });

  it("consistency check 1: identical calc WITHOUT the flight returns the original $83.84", () => {
    const snap = snapshotAt(noFlight, "2026-09-11");
    expect(snap.baselineCents).toBe(8_384);
    // exact original baseline is 30,600 / 365 = 83.8356... cents
    const exact = new Decimal(snap.baselineExactCents);
    expect(exact.minus("8383.5616").abs().lt("0.01")).toBe(true);
  });

  it("consistency check 2: the drop equals the deficit spread evenly", () => {
    const original = new Decimal(snapshotAt(noFlight, "2026-09-11").baselineExactCents);
    const recalced = new Decimal(snapshotAt(withFlight, "2026-09-11").baselineExactCents);
    const drop = original.minus(recalced);
    // $500 overspend / 355 remaining days = 1.4085/day
    expect(drop.minus(new Decimal(50_000).div(355)).abs().lt("0.1")).toBe(true);
  });

  it("resets the accumulated S2S balance to 0 the day after the overspend", () => {
    const state = computePlanState(withFlight, "2026-09-11");
    // Morning of Sep 11 balance was reset to 0, then Sep 11 grants the new baseline.
    expect(state.baselineCents).toBe(8_243);
    expect(state.s2sBalanceCents).toBe(8_243);
  });
});

describe("Example 5 — planning a one-time trip drops the Baseline by its even spread", () => {
  it("an $800 trip reserves immediately and lowers the daily by 800/RD", () => {
    const trip = {
      id: "thanksgiving",
      name: "Thanksgiving trip",
      isRecurring: false,
      amountPerOccurrenceCents: 80_000,
      targetDate: "2026-11-25",
      addedOn: "2026-09-16",
    };
    const withTrip = mariaInput([...MARIA_PROGRAMS, trip]);
    const before = new Decimal(snapshotAt(mariaInput(), "2026-09-17").baselineExactCents);
    const after = new Decimal(snapshotAt(withTrip, "2026-09-17").baselineExactCents);
    const drop = before.minus(after);
    // RD on Sep 17 = 349 days; 80,000 / 349 = 229.23 cents/day.
    expect(drop.minus(new Decimal(80_000).div(349)).abs().lt("0.5")).toBe(true);
  });
});

describe("Example 6 — a plan that isn't viable produces a friendly deficit", () => {
  it("a $30,000 trip drives the Baseline negative and flags a deficit", () => {
    const bigTrip = {
      id: "bigtrip",
      name: "Huge trip",
      isRecurring: false,
      amountPerOccurrenceCents: 3_000_000,
      targetDate: "2026-11-25",
      addedOn: "2026-09-16",
    };
    const state = computePlanState(
      mariaInput([...MARIA_PROGRAMS, bigTrip]),
      "2026-09-17",
    );
    expect(state.isDeficit).toBe(true);
    expect(state.baselineCents).toBeLessThan(0);
  });
});

describe("Example 7 — spending a program surplus does not recalculate", () => {
  it("a $550 spend against a $600 bucket leaves $50 and no recalc", () => {
    const spends: EngineSpendEntry[] = [
      { id: "trip-oct", date: "2026-10-02", amountCents: 55_000, type: "program", programSpendId: "trips" },
    ];
    const state = computePlanState(mariaInput(MARIA_PROGRAMS, spends), "2026-10-03");
    const trips = state.buckets.find((b) => b.programSpendId === "trips");
    expect(trips?.balanceCents).toBe(5_000); // $50 remains
    expect(state.baselineCents).toBe(8_384); // unchanged — no recalc
    expect(state.isDeficit).toBe(false);
  });
});

describe("Program overspend (bucket goes negative) triggers a recalc", () => {
  it("lowers the forward Baseline without touching banked S2S", () => {
    const spends: EngineSpendEntry[] = [
      // Spend far more on groceries than the bucket holds.
      { id: "groc-huge", date: "2026-09-01", amountCents: 300_000, type: "program", programSpendId: "groceries" },
    ];
    const state = computePlanState(mariaInput(MARIA_PROGRAMS, spends), "2026-09-05");
    expect(state.baselineCents).toBeLessThan(8_384);
  });
});
