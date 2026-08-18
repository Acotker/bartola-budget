import { describe, it, expect } from "vitest";
import { splitAmount, resolveProportional, type SplitRule } from "../split";

// Golden cases for split allocation (spec Part 10, T9/T10). Members "ana" and
// "partner" — "ana" < "partner", so ana wins ties (ascending id, C6).

const MEMBERS = ["ana", "partner"];

// ── T9 — split remainder allocation (C6) ─────────────────────────────────────
describe("T9 — largest-remainder split is exact and deterministic", () => {
  it("9a: proportional, non-terminating shares still sum to the amount", () => {
    const rule = resolveProportional(
      "proportional_to_pool",
      { ana: 16_000_000, partner: 7_000_000 },
      "2026-09-01",
    ).rule;
    const shares = splitAmount(240_000, rule, MEMBERS);
    const by = Object.fromEntries(shares.map((s) => [s.memberId, s.amountCents]));
    expect(by.ana).toBe(166_957); // 240,000 × 16/23 = 166,956.52 → gets the leftover cent
    expect(by.partner).toBe(73_043); // 240,000 × 7/23 = 73,043.48
    expect(by.ana + by.partner).toBe(240_000);
  });

  it("9b: an exact tie goes to the lowest member id, deterministically", () => {
    const rule: SplitRule = { type: "equal", config: {} };
    const shares = splitAmount(240_001, rule, MEMBERS);
    const by = Object.fromEntries(shares.map((s) => [s.memberId, s.amountCents]));
    expect(by.ana).toBe(120_001); // both raw 120,000.5 → tie at .5 → ana takes it
    expect(by.partner).toBe(120_000);
    expect(by.ana + by.partner).toBe(240_001);
  });

  it("9c: property — Σ shares == amount, all shares >= 0, stable across runs", () => {
    // Deterministic PRNG (no Math.random) so failures reproduce.
    let seed = 123456789;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const pool = ["a", "b", "c", "d"];
    for (let i = 0; i < 5000; i++) {
      const n = 2 + Math.floor(rand() * 3); // 2..4 members
      const members = pool.slice(0, n);
      const amount = Math.floor(rand() * 5_000_000);
      const kind = Math.floor(rand() * 3);
      let rule: SplitRule;
      if (kind === 0) rule = { type: "equal", config: {} };
      else if (kind === 1)
        rule = {
          type: "custom_percent",
          config: {
            weights: Object.fromEntries(
              members.map((m) => [m, 1 + Math.floor(rand() * 1000)]),
            ),
          },
        };
      else rule = { type: "single_payer", config: { payer: members[Math.floor(rand() * n)] } };

      const shares = splitAmount(amount, rule, members);
      const total = shares.reduce((s, x) => s + x.amountCents, 0);
      expect(total).toBe(amount);
      expect(shares.every((x) => x.amountCents >= 0)).toBe(true);
      // stable across repeated runs
      const again = splitAmount(amount, rule, members);
      expect(again).toEqual(shares);
    }
  });
});

// ── T10 — 🔒 proportional splits resolve once and freeze ─────────────────────
describe("T10 — a resolved proportional split does not move when pools change", () => {
  it("freezes the snapshot into custom_percent and holds the split", () => {
    const resolved = resolveProportional(
      "proportional_to_pool",
      { ana: 16_000_000, partner: 7_000_000 },
      "2026-09-01",
    );
    expect(resolved.rule.type).toBe("custom_percent");
    expect(resolved.derivedFrom.snapshot).toEqual({
      ana: 16_000_000,
      partner: 7_000_000,
    });

    const septSplit = splitAmount(240_000, resolved.rule, MEMBERS);

    // A month later the pools have changed — but the rule is frozen, so splitting
    // with the SAME resolved rule gives the identical allocation. Nothing about
    // splitAmount reads live pools; the weights are the September snapshot.
    const octSplit = splitAmount(240_000, resolved.rule, MEMBERS);
    expect(octSplit).toEqual(septSplit);
    const by = Object.fromEntries(octSplit.map((s) => [s.memberId, s.amountCents]));
    expect(by.ana).toBe(166_957);
    expect(by.partner).toBe(73_043);
  });
});
