import { DateTime } from "luxon";
import { ZONE, dt, toISO } from "./dates";
import type { EngineProgramSpend, EnginePlan, ISODate } from "./types";

/**
 * Expand a Program Spend into concrete occurrence dates within the plan window.
 *
 * Window is half-open: occurrences on/after the plan start and STRICTLY BEFORE
 * the plan end. This matches the brief's Maria figures exactly — a 365-day
 * runway yields 12 monthly, 52 weekly, and 12 monthly occurrences (a weekly
 * event does not fire on the final boundary day).
 *
 * Occurrences are always derived from the rule here, never materialized rows.
 */
export function occurrencesFor(
  program: EngineProgramSpend,
  plan: EnginePlan,
): ISODate[] {
  const windowStart = program.startDate ?? plan.startDate;
  const windowEnd = program.endDate ?? plan.endDate;

  // Effective end is the earlier of the program window end and the plan end,
  // and is exclusive.
  const end = windowEnd < plan.endDate ? windowEnd : plan.endDate;
  const start = windowStart > plan.startDate ? windowStart : plan.startDate;

  if (!program.isRecurring) {
    const target = program.targetDate;
    if (!target) return [];
    // One-time occurrences are included up to and including the plan end date.
    if (target >= plan.startDate && target <= plan.endDate) return [target];
    return [];
  }

  const rule = program.recurrence;
  if (!rule) return [];

  if (rule.freq === "monthly") {
    return monthlyOccurrences(start, end, rule.anchorDay ?? dt(start).day);
  }

  if (rule.freq === "daily") {
    return steppedOccurrences(start, end, 1, dt(start));
  }

  const step = rule.freq === "biweekly" ? 14 : 7;
  // Weekly/biweekly anchor to a weekday when given; otherwise to the window
  // start (back-compat with pre-weekday programs).
  const first =
    rule.anchorWeekday != null
      ? firstWeekdayOnOrAfter(start, rule.anchorWeekday)
      : dt(start);
  return steppedOccurrences(start, end, step, first);
}

function steppedOccurrences(
  startIso: ISODate,
  endExclusiveIso: ISODate,
  step: number,
  first: DateTime,
): ISODate[] {
  const out: ISODate[] = [];
  let cur = first;
  while (toISO(cur) < startIso) cur = cur.plus({ days: step });
  while (toISO(cur) < endExclusiveIso) {
    out.push(toISO(cur));
    cur = cur.plus({ days: step });
  }
  return out;
}

/** Luxon weekday: 1=Mon … 7=Sun. Returns the first such weekday on/after `startIso`. */
function firstWeekdayOnOrAfter(startIso: ISODate, anchorWeekday: number): DateTime {
  const cur = dt(startIso);
  const diff = ((anchorWeekday - cur.weekday) % 7 + 7) % 7;
  return cur.plus({ days: diff });
}

function monthlyOccurrences(
  startIso: ISODate,
  endExclusiveIso: ISODate,
  anchorDay: number,
): ISODate[] {
  const out: ISODate[] = [];
  const startDT = dt(startIso);
  // Begin from the anchor day in the start month, clamped to month length.
  const cursor = DateTime.fromObject(
    { year: startDT.year, month: startDT.month, day: 1 },
    { zone: ZONE },
  );

  // Walk months until we pass the exclusive end.
  for (let i = 0; i < 600; i += 1) {
    const monthDate = cursor.plus({ months: i });
    const day = Math.min(anchorDay, monthDate.daysInMonth ?? 28);
    const occ = monthDate.set({ day });
    const occIso = toISO(occ);
    if (occIso >= endExclusiveIso) break;
    if (occIso >= startIso) out.push(occIso);
  }
  return out;
}
