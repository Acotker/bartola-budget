import { describe, it, expect } from "vitest";
import { memberState, sharedBucketBalance } from "../household";
import type { Household } from "../household";
import type { EngineProgramSpend } from "../types";

// T12 (spec Part 10) — the shared discretionary bucket is just a Program Spend:
// reserved per member, its surplus accrues, and an overage attributes to whoever
// logged it (with a one-tap "split this").

const HORIZON = { startDate: "2026-09-01", endDate: "2026-12-31" };

const monthly = (id: string, name: string, cents: number): EngineProgramSpend => ({
  id,
  name,
  isRecurring: true,
  amountPerOccurrenceCents: cents,
  recurrence: { freq: "monthly", anchorDay: 1 },
});

const equal = { type: "equal" as const, config: {} };

const household = (over: {
  sharedSpends?: Household["sharedSpends"];
  split?: boolean;
}): Household => ({
  ...HORIZON,
  members: [
    {
      id: "ana",
      assets: [{ balanceCents: 60_000, spendable: true }],
      tranches: [
        { id: "loan", grossCents: 1_840_000, feesCents: 0, passthroughCents: 0, date: "2026-09-12", certainty: "confirmed" },
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
  sharedObligations: [
    { program: monthly("rent", "Rent", 240_000), rule: equal },
    { program: monthly("together", "Together", 80_000), rule: equal },
  ],
  sharedSpends: over.sharedSpends,
  splitSharedOverage: over.split,
});

describe("T12 — shared discretionary bucket", () => {
  it("reserves the shared bucket per member, giving each their daily", () => {
    const h = household({});
    // Ana free = 1,900,000 − 480,000 rent − 160,000 Together = 1,260,000
    expect(memberState(h, "ana").baselineCents).toBe(10_327);
    // Partner free = 900,000 − 480,000 − 160,000 = 260,000
    expect(memberState(h, "partner").baselineCents).toBe(2_131);
  });

  it("the bucket posts, is drawn by either member, and accrues when unspent", () => {
    const spends = [
      { memberId: "ana", sharedObligationId: "together", date: "2026-09-03", amountCents: 25_000 },
      { memberId: "partner", sharedObligationId: "together", date: "2026-09-10", amountCents: 40_000 },
    ];
    const h = household({ sharedSpends: spends });
    expect(sharedBucketBalance(h, "together", "2026-09-01")).toBe(80_000);
    expect(sharedBucketBalance(h, "together", "2026-09-03")).toBe(55_000);
    expect(sharedBucketBalance(h, "together", "2026-09-10")).toBe(15_000);
    // nothing more spent → a second month accrues on top
    expect(sharedBucketBalance(h, "together", "2026-10-01")).toBe(95_000);
    // accrual inherited: unspent, the bucket holds two months by Oct 1
    expect(sharedBucketBalance(household({}), "together", "2026-10-01")).toBe(160_000);
  });

  it("an overage attributes to the logging member; the other's daily is untouched", () => {
    const overspend = [
      { memberId: "ana", sharedObligationId: "together", date: "2026-09-03", amountCents: 25_000 },
      { memberId: "partner", sharedObligationId: "together", date: "2026-09-10", amountCents: 40_000 },
      { memberId: "ana", sharedObligationId: "together", date: "2026-09-20", amountCents: 20_000 },
    ];
    const clean = household({});
    const overrun = household({ sharedSpends: overspend });
    const after = "2026-09-30"; // evaluate once the forward recalc has taken effect

    expect(sharedBucketBalance(overrun, "together", "2026-09-20")).toBe(-5_000);
    // Ana logged the overspending spend → her daily eases
    expect(memberState(overrun, "ana", after).baselineCents).toBeLessThan(
      memberState(clean, "ana", after).baselineCents,
    );
    // 🔒 Partner's daily is bit-identical to before the overage
    expect(memberState(overrun, "partner", after).baselineCents).toBe(
      memberState(clean, "partner", after).baselineCents,
    );
  });

  it('"split this" re-attributes the overage — Ana partly restored, Partner eases', () => {
    const overspend = [
      { memberId: "ana", sharedObligationId: "together", date: "2026-09-03", amountCents: 25_000 },
      { memberId: "partner", sharedObligationId: "together", date: "2026-09-10", amountCents: 40_000 },
      { memberId: "ana", sharedObligationId: "together", date: "2026-09-20", amountCents: 20_000 },
    ];
    const clean = household({});
    const onAna = household({ sharedSpends: overspend });
    const split = household({ sharedSpends: overspend, split: true });
    const after = "2026-09-30";

    // Ana: split restores some of her daily vs. owning the whole overage
    expect(memberState(split, "ana", after).baselineCents).toBeGreaterThan(
      memberState(onAna, "ana", after).baselineCents,
    );
    // Partner: now eases below the clean baseline (takes half the overage)
    expect(memberState(split, "partner", after).baselineCents).toBeLessThan(
      memberState(clean, "partner", after).baselineCents,
    );
  });
});
