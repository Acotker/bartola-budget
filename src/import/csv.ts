// §4 — File parsing: CSV text -> outflow transactions in integer cents.

import { DateTime } from "luxon";
import { ZONE } from "@/engine";
import { normalizeDescription } from "./normalize";
import type {
  DetectedColumns,
  ISODate,
  ParseResult,
  ParsedTransaction,
  SignConvention,
} from "./types";

export const MAX_ROWS = 50_000;

/** Minimal RFC4180 CSV reader — handles quoted fields, escaped quotes, CRLF. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-blank trailing rows.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES = {
  date: ["date", "transaction date", "posting date", "post date", "trans date", "transaction_date"],
  description: ["description", "memo", "merchant", "payee", "details", "name", "transaction description"],
  amount: ["amount", "transaction amount", "amt"],
  debit: ["debit", "withdrawal", "withdrawals", "debit amount", "money out"],
  credit: ["credit", "deposit", "deposits", "credit amount", "money in"],
  account: ["account", "card", "account name", "card name", "account number", "card no"],
} as const;

function matchHeader(cell: string, aliases: readonly string[]): boolean {
  const c = cell.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return aliases.includes(c);
}

/** Fuzzy header detection — by name, never by fixed position. */
export function detectColumns(header: string[]): DetectedColumns | null {
  const find = (aliases: readonly string[]) =>
    header.findIndex((h) => matchHeader(h, aliases));

  const date = find(HEADER_ALIASES.date);
  const description = find(HEADER_ALIASES.description);
  const amount = find(HEADER_ALIASES.amount);
  const debit = find(HEADER_ALIASES.debit);
  const credit = find(HEADER_ALIASES.credit);
  const account = find(HEADER_ALIASES.account);

  if (date < 0 || description < 0) return null;
  if (amount < 0 && debit < 0) return null;

  return {
    date,
    description,
    amount: amount >= 0 ? amount : undefined,
    debit: debit >= 0 ? debit : undefined,
    credit: credit >= 0 ? credit : undefined,
    account: account >= 0 ? account : undefined,
  };
}

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "MM/dd/yyyy",
  "M/d/yyyy",
  "MM/dd/yy",
  "M/d/yy",
  "yyyy/MM/dd",
  "dd-MMM-yyyy",
  "d-MMM-yyyy",
  "MMM d, yyyy",
  "MM-dd-yyyy",
];

/**
 * Parse a date cell to an ISO date.
 * Known v1 simplification: slash dates are read US-style (MM/DD). A DD/MM export
 * would be misread; disambiguating that needs a user prompt like the sign
 * convention, which is deliberately left for a later version.
 */
export function parseDateCell(raw: string): ISODate | null {
  const s = raw.trim();
  if (!s) return null;
  for (const fmt of DATE_FORMATS) {
    const dt = DateTime.fromFormat(s, fmt, { zone: ZONE });
    if (dt.isValid) return dt.toISODate();
  }
  const iso = DateTime.fromISO(s, { zone: ZONE });
  return iso.isValid ? iso.toISODate() : null;
}

/** Parse a money cell to signed cents. Handles $, thousands separators, (parens) negatives. */
export function parseAmountCell(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = s.replace(/[$\s,]/g, "");
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  // Integer cents immediately — never carry a float past this point.
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

export interface ParseOptions {
  /** Explicit user answer, used when auto-detection is ambiguous. */
  signHint?: SignConvention;
}

export function parseCsvTransactions(
  text: string,
  options: ParseOptions = {},
): ParseResult {
  const empty: ParseResult = {
    transactions: [],
    totalRows: 0,
    skippedRows: 0,
    signAmbiguous: false,
    signConvention: null,
    columns: null,
  };

  const grid = splitCsv(text);
  if (grid.length < 2) {
    return { ...empty, error: "That file doesn't have a header row and any transactions." };
  }
  if (grid.length - 1 > MAX_ROWS) {
    return {
      ...empty,
      error: `That file has more than ${MAX_ROWS.toLocaleString()} rows. Try splitting it into smaller exports.`,
    };
  }

  const columns = detectColumns(grid[0]);
  if (!columns) {
    return {
      ...empty,
      error:
        "We couldn't find date, description and amount columns in that file. A standard bank or card CSV export should work.",
    };
  }

  const body = grid.slice(1);
  const totalRows = body.length;

  // --- Sign convention ---
  // With separate Debit/Credit columns the file is explicit: debit is the outflow.
  const useDebitColumn = columns.debit !== undefined;
  let signConvention: SignConvention | null = null;

  if (!useDebitColumn) {
    const amountIdx = columns.amount!;
    let negatives = 0;
    let positives = 0;
    for (const row of body) {
      const cents = parseAmountCell(row[amountIdx] ?? "");
      if (cents == null || cents === 0) continue;
      if (cents < 0) negatives += 1;
      else positives += 1;
    }
    const signed = negatives + positives;
    if (signed === 0) {
      return { ...empty, totalRows, columns, error: "We couldn't read any amounts in that file." };
    }
    if (options.signHint) {
      signConvention = options.signHint;
    } else {
      const negativeShare = negatives / signed;
      // The majority sign is normally spending. Only claim confidence outside a
      // genuinely ambiguous middle band.
      if (negativeShare >= 0.65) signConvention = "negative-is-spend";
      else if (negativeShare <= 0.35) signConvention = "positive-is-spend";
      else {
        return { ...empty, totalRows, columns, signAmbiguous: true };
      }
    }
  }

  const transactions: ParsedTransaction[] = [];
  let skippedRows = 0;

  for (const row of body) {
    const date = parseDateCell(row[columns.date] ?? "");
    const rawDescription = (row[columns.description] ?? "").trim();

    let outflowCents: number | null = null;
    if (useDebitColumn) {
      const debit = parseAmountCell(row[columns.debit!] ?? "");
      // A blank debit cell is a credit row, not a bad row — skip without counting.
      if (debit == null) {
        const credit =
          columns.credit !== undefined ? parseAmountCell(row[columns.credit] ?? "") : null;
        if (credit != null) continue;
        skippedRows += 1;
        continue;
      }
      outflowCents = Math.abs(debit);
    } else {
      const signed = parseAmountCell(row[columns.amount!] ?? "");
      if (signed == null) {
        skippedRows += 1;
        continue;
      }
      const isOutflow =
        signConvention === "negative-is-spend" ? signed < 0 : signed > 0;
      if (!isOutflow) continue; // an inflow/credit — ignored, not skipped
      outflowCents = Math.abs(signed);
    }

    if (!date || !rawDescription || outflowCents == null || outflowCents <= 0) {
      skippedRows += 1;
      continue;
    }

    transactions.push({
      date,
      rawDescription,
      normalizedDescription: normalizeDescription(rawDescription),
      amountCents: outflowCents,
      sourceAccountLabel:
        columns.account !== undefined ? (row[columns.account] ?? "").trim() || undefined : undefined,
    });
  }

  return {
    transactions,
    totalRows,
    skippedRows,
    signAmbiguous: false,
    signConvention,
    columns,
  };
}
