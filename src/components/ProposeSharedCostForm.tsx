"use client";

import { useState } from "react";
import { occurrencesFor, type EnginePlan } from "@/engine";
import { proposeSharedCostAction } from "@/app/split-actions";
import { formatShortDate } from "@/lib/format";
import {
  Field,
  ScheduleFields,
  ScheduleHiddenInputs,
  buildScheduleSummary,
  type Kind,
} from "@/components/program-schedule";

/** Same recurrence picker as a personal Program Spend (one-time or
 *  daily/weekly/biweekly/monthly, with a day/date and window) — a shared cost
 *  is exactly as expressive as a personal one, split equally to start. */
export function ProposeSharedCostForm({
  startDate,
  endDate,
  asOf,
}: {
  startDate: string;
  endDate: string;
  asOf: string;
}) {
  const defaultStart = asOf > startDate ? asOf : startDate;

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<Kind>("monthly");
  const [anchorWeekday, setAnchorWeekday] = useState(1);
  const [anchorDay, setAnchorDay] = useState(1);
  const [targetDate, setTargetDate] = useState("");
  const [rangeStart, setRangeStart] = useState(defaultStart);
  const [rangeEnd, setRangeEnd] = useState(endDate);

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const plan: EnginePlan = { poolCents: 0, startDate, endDate };

  const previewOccurrences =
    cents > 0
      ? occurrencesFor(
          kind === "onetime"
            ? {
                id: "__preview__",
                name: name || "This",
                isRecurring: false,
                amountPerOccurrenceCents: cents,
                targetDate: targetDate || endDate,
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
                startDate: rangeStart,
                endDate: rangeEnd,
                addedOn: asOf,
              },
          plan,
        ).slice(0, 5)
      : [];

  const summary = buildScheduleSummary({
    kind,
    cents,
    anchorWeekday,
    anchorDay,
    startDate: rangeStart,
    endDate: rangeEnd,
    targetDate,
  });

  const canSubmit =
    !!name.trim() && cents > 0 && (kind !== "onetime" || !!targetDate);

  return (
    <form
      action={proposeSharedCostAction}
      className="bg-card border-line mt-3 space-y-4 rounded-2xl border p-4"
    >
      <ScheduleHiddenInputs
        kind={kind}
        anchorWeekday={anchorWeekday}
        anchorDay={anchorDay}
        targetDate={targetDate}
        startDate={rangeStart}
        endDate={rangeEnd}
      />

      <Field label="What is it?">
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rent, Groceries, a trip together…"
          className="bg-surface text-ink placeholder:text-ink/30 w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
        />
      </Field>

      <Field label="How much each time?">
        <input
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          className="bg-surface text-ink tnum w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
        />
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
        startDate={rangeStart}
        setStartDate={setRangeStart}
        endDate={rangeEnd}
        setEndDate={setRangeEnd}
      />

      {summary && (
        <div className="bg-surface rounded-xl px-3 py-2.5">
          <p className="text-muted text-[11px] font-bold uppercase tracking-wide">
            In plain words
          </p>
          <p className="text-ink mt-1 text-sm font-bold">
            {summary}, split equally
          </p>
          {previewOccurrences.length > 0 && (
            <p className="text-muted mt-1.5 text-xs">
              Next: {previewOccurrences.map((d) => formatShortDate(d)).join(" · ")}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="border-primary text-primary flex h-11 w-full items-center justify-center rounded-full border text-sm font-bold active:scale-[0.98] disabled:opacity-40"
      >
        Propose
      </button>
    </form>
  );
}
