import type { EngineProgramSpend, EnginePlan } from "../types";

// The "Maria" scenario from the brief, in integer cents.
// Pool $60,000; runway Sep 1 2026 -> Aug 31 2027 (365 days).

export const MARIA_PLAN: EnginePlan = {
  poolCents: 6_000_000,
  startDate: "2026-09-01",
  endDate: "2027-08-31",
};

export const MARIA_RENT: EngineProgramSpend = {
  id: "rent",
  name: "Rent",
  isRecurring: true,
  amountPerOccurrenceCents: 150_000, // $1,500
  recurrence: { freq: "monthly", anchorDay: 1 },
};

export const MARIA_GROCERIES: EngineProgramSpend = {
  id: "groceries",
  name: "Groceries",
  isRecurring: true,
  amountPerOccurrenceCents: 15_000, // $150
  recurrence: { freq: "weekly" },
};

export const MARIA_TRIPS: EngineProgramSpend = {
  id: "trips",
  name: "Trips fund",
  isRecurring: true,
  amountPerOccurrenceCents: 30_000, // $300
  recurrence: { freq: "monthly", anchorDay: 1 },
};

export const MARIA_PROGRAMS: EngineProgramSpend[] = [
  MARIA_RENT,
  MARIA_GROCERIES,
  MARIA_TRIPS,
];
