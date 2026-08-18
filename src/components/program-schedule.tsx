"use client";

// Shared recurrence/schedule picker used by AddProgramForm (personal Program
// Spends) and ProposeSharedCostForm (shared costs) — same options, same copy,
// so a shared cost is exactly as expressive as a personal one: one-time or
// recurring, how often, and on which day.

import type { ReactNode } from "react";
import { formatCents, formatShortDate } from "@/lib/format";

export type Kind = "daily" | "weekly" | "biweekly" | "monthly" | "onetime";

export const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "onetime", label: "One time" },
];

export const WEEKDAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

export interface ScheduleState {
  kind: Kind;
  setKind: (k: Kind) => void;
  anchorWeekday: number;
  setAnchorWeekday: (n: number) => void;
  anchorDay: number;
  setAnchorDay: (n: number) => void;
  targetDate: string;
  setTargetDate: (d: string) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
}

/** Hidden form fields carrying the schedule to the server action, matching
 *  createProgramAction's expected field names exactly. */
export function ScheduleHiddenInputs({
  kind,
  anchorWeekday,
  anchorDay,
  targetDate,
  startDate,
  endDate,
}: Pick<
  ScheduleState,
  "kind" | "anchorWeekday" | "anchorDay" | "targetDate" | "startDate" | "endDate"
>) {
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      {(kind === "weekly" || kind === "biweekly") && (
        <input type="hidden" name="anchorWeekday" value={anchorWeekday} />
      )}
      {kind === "monthly" && (
        <input type="hidden" name="anchorDay" value={anchorDay} />
      )}
      {kind === "onetime" && (
        <input type="hidden" name="targetDate" value={targetDate} />
      )}
      {kind !== "onetime" && (
        <>
          <input type="hidden" name="startDate" value={startDate} />
          <input type="hidden" name="endDate" value={endDate} />
        </>
      )}
    </>
  );
}

/** "How often? / On which day? / Starts–Ends or On what date?" — the full
 *  recurrence picker, visible fields only (pair with ScheduleHiddenInputs). */
export function ScheduleFields(s: ScheduleState) {
  return (
    <>
      <Field label="How often?">
        <div className="grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => s.setKind(o.value)}
              className={`rounded-xl px-3 py-3 text-sm font-bold shadow-sm transition ${
                s.kind === o.value ? "bg-primary text-white" : "bg-card text-ink/70"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>

      {(s.kind === "weekly" || s.kind === "biweekly") && (
        <Field label="On which day?">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => (
              <button
                key={w.n}
                type="button"
                onClick={() => s.setAnchorWeekday(w.n)}
                className={`h-11 w-11 rounded-full text-xs font-bold shadow-sm transition ${
                  s.anchorWeekday === w.n
                    ? "bg-primary text-white"
                    : "bg-card text-ink/70"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      {s.kind === "monthly" && (
        <Field label="On which day of the month?">
          <select
            value={s.anchorDay}
            onChange={(e) => s.setAnchorDay(Number(e.target.value))}
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                the {ordinal(d)}
              </option>
            ))}
          </select>
          <p className="text-ink/40 mt-1 text-xs">
            Months without that day use the last day (e.g. the 31st → Feb 28).
          </p>
        </Field>
      )}

      {s.kind === "onetime" ? (
        <Field label="On what date?">
          <input
            type="date"
            value={s.targetDate}
            onChange={(e) => s.setTargetDate(e.target.value)}
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input
              type="date"
              value={s.startDate}
              onChange={(e) => s.setStartDate(e.target.value)}
              className="bg-card text-ink w-full rounded-xl px-3 py-3 text-sm shadow-sm outline-none"
            />
          </Field>
          <Field label="Ends">
            <input
              type="date"
              value={s.endDate}
              onChange={(e) => s.setEndDate(e.target.value)}
              className="bg-card text-ink w-full rounded-xl px-3 py-3 text-sm shadow-sm outline-none"
            />
          </Field>
        </div>
      )}
    </>
  );
}

export function buildScheduleSummary(a: {
  kind: Kind;
  cents: number;
  anchorWeekday: number;
  anchorDay: number;
  startDate: string;
  endDate: string;
  targetDate: string;
}): string | null {
  if (a.cents <= 0) return null;
  const amt = formatCents(a.cents);
  const weekdayLabel = WEEKDAYS.find((w) => w.n === a.anchorWeekday)?.label ?? "Mon";
  const range = `${formatShortDate(a.startDate)} → ${formatShortDate(a.endDate)}`;
  switch (a.kind) {
    case "daily":
      return `${amt} every day, ${range}`;
    case "weekly":
      return `${amt} every ${weekdayLabel}, ${range}`;
    case "biweekly":
      return `${amt} every other ${weekdayLabel}, ${range}`;
    case "monthly":
      return `${amt} on the ${ordinal(a.anchorDay)} of each month, ${range}`;
    case "onetime":
      return a.targetDate
        ? `${amt} once on ${formatShortDate(a.targetDate)}`
        : `${amt}, pick a date`;
  }
}
