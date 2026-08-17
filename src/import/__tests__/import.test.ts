import { describe, it, expect } from "vitest";
import { normalizeDescription, titleCaseMerchant } from "../normalize";
import { tokenSetSimilarity } from "../similarity";
import { parseCsvTransactions, parseAmountCell, parseDateCell, splitCsv } from "../csv";
import { detectCandidates, splitIntoSeries, amountsConsistent, fingerprintFor } from "../detect";
import type { ParsedTransaction } from "../types";

/** Build a transaction the way the parser would. */
function txn(date: string, description: string, dollars: number): ParsedTransaction {
  return {
    date,
    rawDescription: description,
    normalizedDescription: normalizeDescription(description),
    amountCents: Math.round(dollars * 100),
  };
}

function csv(rows: string[][]): string {
  return rows.map((r) => r.join(",")).join("\n");
}

describe("Stage A — normalization", () => {
  it("strips processor prefixes, reference numbers and phone numbers", () => {
    expect(normalizeDescription("SQ *BLUE BOTTLE COFFEE")).toBe("BLUE BOTTLE COFFEE");
    expect(normalizeDescription("NETFLIX.COM  #123456")).toBe("NETFLIX.COM");
    expect(normalizeDescription("SPOTIFY USA 866-555-1212")).toBe("SPOTIFY USA");
    expect(normalizeDescription("  netflix.com   ")).toBe("NETFLIX.COM");
  });

  it("strips a phone number without leaving a mangled tail", () => {
    // The reference-number pattern alone would bite off only "1212".
    expect(normalizeDescription("ACME GYM 415-555-1212")).toBe("ACME GYM");
  });

  it("title-cases a readable default name", () => {
    expect(titleCaseMerchant("NETFLIX")).toBe("Netflix");
    expect(titleCaseMerchant("SPOTIFY USA")).toBe("Spotify USA");
  });
});

describe("Stage B — similarity guard", () => {
  it("merges a merchant with an extra qualifier but not a different product line", () => {
    expect(tokenSetSimilarity("SPOTIFY USA", "SPOTIFY USA LLC")).toBeGreaterThanOrEqual(0.85);
    expect(tokenSetSimilarity("AMAZON", "AMAZON WEB SERVICES")).toBeLessThan(0.85);
    expect(tokenSetSimilarity("UBER TRIP", "UBER EATS")).toBeLessThan(0.85);
  });
});

describe("Stage C — amount tolerance", () => {
  it("allows $1 or 10%, whichever is larger", () => {
    expect(amountsConsistent([999, 1049])).toBe(true); // 50c apart
    expect(amountsConsistent([10_000, 10_900])).toBe(true); // 9% of $100
    expect(amountsConsistent([999, 20_000])).toBe(false); // a one-off outlier
  });
});

// ----------------------------------------------------------------- §10 cases

describe("§10.1 — a clean monthly subscription", () => {
  it("is high confidence with the right cadence and amount", () => {
    const txns = [
      txn("2026-06-04", "NETFLIX.COM", 15.49),
      txn("2026-07-04", "NETFLIX.COM", 15.49),
      txn("2026-08-04", "NETFLIX.COM", 15.49),
    ];
    const [c] = detectCandidates(txns);
    expect(c.suggestedName).toBe("Netflix.com");
    expect(c.suggestedCadence).toBe("monthly");
    expect(c.confidenceTier).toBe("high");
    expect(c.suggestedAmountCents).toBe(1549);
    expect(c.occurrenceCount).toBe(3);
    expect(c.anchorDay).toBe(4);
  });
});

describe("§10.2 — a price change partway through (the most important case)", () => {
  it("suggests the HIGHER amount, never the average", () => {
    const txns = [
      txn("2026-06-10", "SPOTIFY USA", 9.99),
      txn("2026-07-10", "SPOTIFY USA", 9.99),
      txn("2026-08-10", "SPOTIFY USA", 10.49),
    ];
    const [c] = detectCandidates(txns);
    expect(c.confidenceTier).toBe("high");
    expect(c.minAmountCents).toBe(999);
    expect(c.maxAmountCents).toBe(1049);
    // Principle 2 — the whole point: reserve the max, not the mean (1049, not 1032).
    expect(c.suggestedAmountCents).toBe(1049);
  });
});

describe("§10.3 — only two occurrences", () => {
  it("surfaces as 'possible' rather than being dropped", () => {
    const txns = [
      txn("2026-07-15", "ACME GYM", 40.0),
      txn("2026-08-15", "ACME GYM", 40.0),
    ];
    const candidates = detectCandidates(txns);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidenceTier).toBe("possible");
    expect(candidates[0].suggestedCadence).toBe("monthly");
  });
});

describe("§10.4 — two overlapping monthly series at one merchant", () => {
  it("detects both cycles separately instead of one broken pattern", () => {
    const txns = [
      txn("2026-06-02", "CITY PARKING", 25.0),
      txn("2026-06-15", "CITY PARKING", 25.0),
      txn("2026-07-02", "CITY PARKING", 25.0),
      txn("2026-07-15", "CITY PARKING", 25.0),
      txn("2026-08-02", "CITY PARKING", 25.0),
      txn("2026-08-15", "CITY PARKING", 25.0),
    ];
    const candidates = detectCandidates(txns);
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.suggestedCadence === "monthly")).toBe(true);
    expect(candidates.map((c) => c.anchorDay).sort((a, b) => a! - b!)).toEqual([2, 15]);
    expect(candidates.every((c) => c.occurrenceCount === 3)).toBe(true);
  });

  it("splitIntoSeries returns one series for a clean monthly run", () => {
    expect(splitIntoSeries(["2026-06-01", "2026-07-01", "2026-08-01"])).toHaveLength(1);
  });
});

describe("§10.5 — a one-off purchase at a merchant that also has a subscription", () => {
  it("keeps the subscription and drops the outlier", () => {
    const txns = [
      txn("2026-03-20", "BIG BOX STORE", 200.0), // one-off electronics buy
      ...Array.from({ length: 6 }, (_, i) =>
        txn(`2026-0${i + 2}-08`, "BIG BOX STORE", 9.99),
      ),
    ];
    const candidates = detectCandidates(txns);
    // The $9.99 series survives...
    const sub = candidates.find((c) => c.suggestedAmountCents === 999);
    expect(sub).toBeDefined();
    expect(sub!.occurrenceCount).toBe(6);
    expect(sub!.confidenceTier).toBe("high");
    // ...and the single $200 charge produces no candidate at all.
    expect(candidates.some((c) => c.maxAmountCents === 20_000)).toBe(false);
  });
});

describe("§10.6 — ambiguous sign convention", () => {
  it("asks instead of guessing", () => {
    const text = csv([
      ["Date", "Description", "Amount"],
      ["2026-08-01", "A", "-10.00"],
      ["2026-08-02", "B", "20.00"],
      ["2026-08-03", "C", "-30.00"],
      ["2026-08-04", "D", "40.00"],
    ]);
    const result = parseCsvTransactions(text);
    expect(result.signAmbiguous).toBe(true);
    expect(result.transactions).toHaveLength(0);
  });

  it("honours an explicit user answer", () => {
    const text = csv([
      ["Date", "Description", "Amount"],
      ["2026-08-01", "A", "-10.00"],
      ["2026-08-02", "B", "20.00"],
      ["2026-08-03", "C", "-30.00"],
      ["2026-08-04", "D", "40.00"],
    ]);
    const result = parseCsvTransactions(text, { signHint: "negative-is-spend" });
    expect(result.signAmbiguous).toBe(false);
    expect(result.transactions.map((t) => t.amountCents)).toEqual([1000, 3000]);
  });

  it("infers the majority sign when the file is clear", () => {
    const rows = [["Date", "Description", "Amount"]];
    for (let i = 1; i <= 9; i += 1) rows.push([`2026-08-0${i}`, "SHOP", "-5.00"]);
    rows.push(["2026-08-10", "PAYCHECK", "1000.00"]);
    const result = parseCsvTransactions(csv(rows));
    expect(result.signConvention).toBe("negative-is-spend");
    expect(result.transactions).toHaveLength(9); // the inflow is ignored, not skipped
    expect(result.skippedRows).toBe(0);
  });
});

describe("§10.7 — partially unparseable file", () => {
  it("still succeeds and reports an accurate skipped count", () => {
    const text = csv([
      ["Date", "Description", "Amount"],
      ["2026-08-01", "NETFLIX.COM", "-15.49"],
      ["not-a-date", "NETFLIX.COM", "-15.49"],
      ["2026-08-03", "NETFLIX.COM", "not-a-number"],
      ["2026-09-01", "NETFLIX.COM", "-15.49"],
      ["2026-10-01", "NETFLIX.COM", "-15.49"],
    ]);
    const result = parseCsvTransactions(text);
    expect(result.totalRows).toBe(5);
    expect(result.skippedRows).toBe(2);
    expect(result.transactions).toHaveLength(3);
    const [c] = detectCandidates(result.transactions);
    expect(c.confidenceTier).toBe("high");
    expect(c.suggestedCadence).toBe("monthly");
  });
});

describe("§4 — parsing details", () => {
  it("handles quoted fields with commas, $ signs and parens negatives", () => {
    expect(splitCsv('a,"b,c",d')[0]).toEqual(["a", "b,c", "d"]);
    expect(parseAmountCell("$1,234.56")).toBe(123_456);
    expect(parseAmountCell("(12.34)")).toBe(-1234);
    expect(parseAmountCell("")).toBeNull();
    expect(parseAmountCell("abc")).toBeNull();
  });

  it("reads common date formats", () => {
    expect(parseDateCell("2026-08-01")).toBe("2026-08-01");
    expect(parseDateCell("08/01/2026")).toBe("2026-08-01");
    expect(parseDateCell("8/1/26")).toBe("2026-08-01");
    expect(parseDateCell("nope")).toBeNull();
  });

  it("detects columns by header name, not position, and prefers Debit", () => {
    const text = csv([
      ["Posting Date", "Card", "Memo", "Debit", "Credit"],
      ["07/05/2026", "Visa 1234", "SQ *COFFEE BAR #99821", "4.75", ""],
      ["07/06/2026", "Visa 1234", "PAYROLL", "", "2000.00"],
    ]);
    const result = parseCsvTransactions(text);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].normalizedDescription).toBe("COFFEE BAR");
    expect(result.transactions[0].sourceAccountLabel).toBe("Visa 1234");
    expect(result.skippedRows).toBe(0); // the credit row is ignored, not skipped
  });

  it("rejects a file with no usable columns", () => {
    const result = parseCsvTransactions(csv([["Foo", "Bar"], ["1", "2"]]));
    expect(result.error).toBeDefined();
    expect(result.transactions).toHaveLength(0);
  });
});

describe("ordering and fingerprints", () => {
  it("sorts candidates by monthly-equivalent cost, descending", () => {
    const txns = [
      // $10/mo
      txn("2026-06-01", "SMALL SUB", 10),
      txn("2026-07-01", "SMALL SUB", 10),
      txn("2026-08-01", "SMALL SUB", 10),
      // $20/wk ~= $87/mo
      txn("2026-08-03", "WEEKLY THING", 20),
      txn("2026-08-10", "WEEKLY THING", 20),
      txn("2026-08-17", "WEEKLY THING", 20),
    ];
    const candidates = detectCandidates(txns);
    expect(candidates[0].normalizedMerchant).toBe("WEEKLY THING");
    expect(candidates[0].suggestedCadence).toBe("weekly");
    expect(candidates[0].anchorWeekday).toBe(1); // Mondays
  });

  it("fingerprints are stable and cadence-aware but amount-independent", () => {
    expect(fingerprintFor("NETFLIX", "monthly")).toBe(fingerprintFor("NETFLIX", "monthly"));
    expect(fingerprintFor("NETFLIX", "monthly")).not.toBe(fingerprintFor("NETFLIX", "weekly"));
  });
});
