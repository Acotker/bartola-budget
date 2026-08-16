"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  computePlanState,
  snapshotAt,
  addDays,
  occurrencesFor,
  type EngineInput,
  type EngineProgramSpend,
} from "@/engine";
import { createProgramAction } from "@/app/actions";
import { formatCents, formatShortDate } from "@/lib/format";

type Kind = "daily" | "weekly" | "biweekly" | "monthly" | "onetime";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "onetime", label: "One time" },
];

const WEEKDAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

interface Props {
  planId: string;
  input: EngineInput;
  asOf: string;
}

export function AddProgramForm({ planId, input, asOf }: Props) {
  const defaultStart = asOf > input.plan.startDate ? asOf : input.plan.startDate;

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>("monthly");
  const [anchorWeekday, setAnchorWeekday] = useState(1);
  const [anchorDay, setAnchorDay] = useState(1);
  const [targetDate, setTargetDate] = useState("");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(input.plan.endDate);

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const weekdayLabel = WEEKDAYS.find((w) => w.n === anchorWeekday)?.label ?? "Mon";

  // Build the in-progress rule so the summary, preview, and delta stay live.
  const tempProgram: EngineProgramSpend =
    kind === "onetime"
      ? {
          id: "__preview__",
          name: name || "This",
          isRecurring: false,
          amountPerOccurrenceCents: cents,
          targetDate: targetDate || input.plan.endDate,
          addedOn: asOf,
        }
      : {
          id: "__preview__",
          name: name || "This",
          isRecurring: true,
          amountPerOccurrenceCents: cents,
          recurrence: {
            freq: kind,
            anchorDay: kind === "monthly" ? anchorDay : undefined,
            anchorWeekday:
              kind === "weekly" || kind === "biweekly" ? anchorWeekday : undefined,
          },
          startDate,
          endDate,
          addedOn: asOf,
        };

  const previewOccurrences =
    cents > 0 ? occurrencesFor(tempProgram, input.plan).slice(0, 5) : [];

  const currentDaily = computePlanState(input, asOf).baselineCents;
  let newDaily = currentDaily;
  let deficit = false;
  if (cents > 0) {
    const snap = snapshotAt(
      { ...input, programs: [...input.programs, tempProgram] },
      addDays(asOf, 1),
    );
    newDaily = snap.baselineCents;
    deficit = newDaily <= 0;
  }

  const summary = buildSummary({
    kind,
    cents,
    weekdayLabel,
    anchorDay,
    startDate,
    endDate,
    targetDate,
  });

  const canSubmit = cents > 0 && (kind !== "onetime" || !!targetDate);

  return (
    <form action={createProgramAction} className="flex flex-1 flex-col gap-5">
      <input type="hidden" name="planId" value={planId} />
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

      <Field label="What is it?">
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rent, Groceries, Thanksgiving trip…"
          className="bg-card text-ink placeholder:text-ink/30 w-full rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
        />
      </Field>

      <Field label="How much each time?">
        <div className="bg-card flex items-center rounded-xl px-4 shadow-sm">
          <span className="text-ink/40 font-heading text-lg font-bold">$</span>
          <input
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            className="tnum text-ink placeholder:text-ink/30 w-full bg-transparent px-2 py-3 text-lg font-bold outline-none"
          />
        </div>
      </Field>

      <Field label="How often?">
        <div className="grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setKind(o.value)}
              className={`rounded-xl px-3 py-3 text-sm font-bold shadow-sm transition ${
                kind === o.value
                  ? "bg-primary text-white"
                  : "bg-card text-ink/70"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>

      {(kind === "weekly" || kind === "biweekly") && (
        <Field label="On which day?">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => (
              <button
                key={w.n}
                type="button"
                onClick={() => setAnchorWeekday(w.n)}
                className={`h-11 w-11 rounded-full text-xs font-bold shadow-sm transition ${
                  anchorWeekday === w.n
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

      {kind === "monthly" && (
        <Field label="On which day of the month?">
          <select
            value={anchorDay}
            onChange={(e) => setAnchorDay(Number(e.target.value))}
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

      {kind === "onetime" ? (
        <Field label="On what date?">
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-card text-ink w-full rounded-xl px-3 py-3 text-sm shadow-sm outline-none"
            />
          </Field>
          <Field label="Ends">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-card text-ink w-full rounded-xl px-3 py-3 text-sm shadow-sm outline-none"
            />
          </Field>
        </div>
      )}

      {summary && (
        <div className="bg-ink/5 rounded-2xl px-4 py-3">
          <p className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            In plain words
          </p>
          <p className="text-ink mt-1 text-sm font-bold">{summary}</p>
          {previewOccurrences.length > 0 && (
            <p className="text-ink/50 mt-2 text-xs">
              Next: {previewOccurrences.map((d) => formatShortDate(d)).join(" · ")}
            </p>
          )}
        </div>
      )}

      {cents > 0 && (
        <div className="border-ink/10 rounded-2xl border border-dashed p-4 text-center">
          <p className="text-ink/50 text-xs">Your daily Safe-to-Spend</p>
          <p className="tnum text-ink font-heading mt-1 text-xl font-bold">
            {formatCents(currentDaily)} <span className="text-ink/30">-&gt;</span>{" "}
            <span className={deficit ? "text-alert" : "text-positive"}>
              {formatCents(newDaily)}
            </span>
          </p>
          {deficit && (
            <p className="text-alert mt-1 text-xs">
              This makes the plan unviable — you can still add it, then adjust.
            </p>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-primary flex h-14 items-center justify-center rounded-full text-base font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-40"
        >
          Add Program Spend
        </button>
        <Link
          href="/programs"
          className="text-ink/50 flex h-10 items-center justify-center text-sm font-bold"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

function buildSummary(a: {
  kind: Kind;
  cents: number;
  weekdayLabel: string;
  anchorDay: number;
  startDate: string;
  endDate: string;
  targetDate: string;
}): string | null {
  if (a.cents <= 0) return null;
  const amt = formatCents(a.cents);
  const range = `${formatShortDate(a.startDate)} → ${formatShortDate(a.endDate)}`;
  switch (a.kind) {
    case "daily":
      return `${amt} every day, ${range}`;
    case "weekly":
      return `${amt} every ${a.weekdayLabel}, ${range}`;
    case "biweekly":
      return `${amt} every other ${a.weekdayLabel}, ${range}`;
    case "monthly":
      return `${amt} on the ${ordinal(a.anchorDay)} of each month, ${range}`;
    case "onetime":
      return a.targetDate
        ? `${amt} once on ${formatShortDate(a.targetDate)}`
        : `${amt}, pick a date`;
  }
}
