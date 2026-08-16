import { DateTime } from "luxon";
import { ZONE } from "@/engine";

/** Render integer cents as a currency string, e.g. -12345 -> "-$123.45". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem.toString().padStart(2, "0")}`;
}

/** Whole-dollar-and-cents split for large display treatments. */
export function splitCents(cents: number): { sign: string; whole: string; frac: string } {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return {
    sign,
    whole: dollars.toLocaleString("en-US"),
    frac: rem.toString().padStart(2, "0"),
  };
}

export function formatLongDate(iso: string): string {
  return DateTime.fromISO(iso, { zone: ZONE }).toFormat("cccc, LLLL d");
}

export function formatShortDate(iso: string): string {
  return DateTime.fromISO(iso, { zone: ZONE }).toFormat("LLL d");
}

export function formatDateYear(iso: string): string {
  return DateTime.fromISO(iso, { zone: ZONE }).toFormat("LLL d, yyyy");
}
