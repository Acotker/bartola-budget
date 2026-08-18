"use client";

import { useState } from "react";
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
import {
  Field,
  ScheduleFields,
  ScheduleHiddenInputs,
  buildScheduleSummary,
  type Kind,
} from "@/components/program-schedule";

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

  const summary = buildScheduleSummary({
    kind,
    cents,
    anchorWeekday,
    anchorDay,
    startDate,
    endDate,
    targetDate,
  });

  const canSubmit = cents > 0 && (kind !== "onetime" || !!targetDate);

  return (
    <form action={createProgramAction} className="flex flex-1 flex-col gap-5">
      <input type="hidden" name="planId" value={planId} />
      <ScheduleHiddenInputs
        kind={kind}
        anchorWeekday={anchorWeekday}
        anchorDay={anchorDay}
        targetDate={targetDate}
        startDate={startDate}
        endDate={endDate}
      />

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

      <ScheduleFields
        kind={kind}
        setKind={setKind}
        anchorWeekday={anchorWeekday}
        setAnchorWeekday={setAnchorWeekday}
        anchorDay={anchorDay}
        setAnchorDay={setAnchorDay}
        targetDate={targetDate}
        setTargetDate={setTargetDate}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
      />

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
