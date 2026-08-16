import { DateTime } from "luxon";
import type { ISODate } from "./types";

/** All engine date math is pinned to Boston time per the brief. */
export const ZONE = "America/New_York";

export function dt(iso: ISODate): DateTime {
  return DateTime.fromISO(iso, { zone: ZONE }).startOf("day");
}

export function toISO(d: DateTime): ISODate {
  const s = d.toISODate();
  if (!s) throw new Error("Invalid date");
  return s;
}

export function addDays(iso: ISODate, n: number): ISODate {
  return toISO(dt(iso).plus({ days: n }));
}

/** Inclusive day count from start through end (both endpoints counted). */
export function daysInclusive(startIso: ISODate, endIso: ISODate): number {
  return Math.round(dt(endIso).diff(dt(startIso), "days").days) + 1;
}

/**
 * Because ISO 'YYYY-MM-DD' strings sort lexically in chronological order, we
 * compare them directly throughout the engine — no parsing needed.
 */
export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b;
}

export function isSameOrBefore(a: ISODate, b: ISODate): boolean {
  return a <= b;
}
