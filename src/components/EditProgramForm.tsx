"use client";

import { useState } from "react";
import {
  computePlanState,
  snapshotAt,
  addDays,
  type EngineInput,
  type EngineProgramSpend,
} from "@/engine";
import { editProgramAction } from "@/app/actions";
import { formatCents } from "@/lib/format";

type RecurKind = "daily" | "weekly" | "biweekly" | "monthly";

const RECUR_OPTIONS: { value: RecurKind; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
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

interface Props {
  program: EngineProgramSpend;
  input: EngineInput;
  asOf: string;
}

export function EditProgramForm({ program, input, asOf }: Props) {
  const recurring = program.isRecurring;
  const [name, setName] = useState(program.name);
  const [amount, setAmount] = useState(
    (program.amountPerOccurrenceCents / 100).toString(),
  );
  const [kind, setKind] = useState<RecurKind>(
    (program.recurrence?.freq as RecurKind) ?? "monthly",
  );
  const [anchorWeekday, setAnchorWeekday] = useState(
    program.recurrence?.anchorWeekday ?? 1,
  );
  const [anchorDay, setAnchorDay] = useState(program.recurrence?.anchorDay ?? 1);
  const [endDate, setEndDate] = useState(program.endDate ?? input.plan.endDate);
  const [targetDate, setTargetDate] = useState(program.targetDate ?? "");

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const boundary = addDays(asOf, 1);
  const currentDaily = computePlanState(input, asOf).baselineCents;

  let newDaily = currentDaily;
  let deficit = false;
  if (cents > 0) {
    const others = input.programs.filter((p) => p.id !== program.id);
    let previewPrograms: EngineProgramSpend[];
    let at = asOf;
    if (recurring) {
      const oldTrunc: EngineProgramSpend = {
        ...program,
        endDate: boundary,
        status: "superseded",
      };
      const newVer: EngineProgramSpend = {
        ...program,
        id: "__new__",
        amountPerOccurrenceCents: cents,
        recurrence: {
          freq: kind,
          anchorDay: kind === "monthly" ? anchorDay : undefined,
          anchorWeekday:
            kind === "weekly" || kind === "biweekly" ? anchorWeekday : undefined,
        },
        startDate: boundary,
        endDate: endDate || program.endDate,
        addedOn: asOf,
        status: "active",
      };
      previewPrograms = [...others, oldTrunc, newVer];
      at = boundary;
    } else {
      previewPrograms = [
        ...others,
        { ...program, amountPerOccurrenceCents: cents, targetDate: targetDate || program.targetDate },
      ];
    }
    const snap = snapshotAt({ ...input, programs: previewPrograms }, at);
    newDaily = snap.baselineCents;
    deficit = newDaily <= 0;
  }

  return (
    <form action={editProgramAction} className="flex flex-col gap-4">
      <input type="hidden" name="programId" value={program.id} />
      {recurring && <input type="hidden" name="kind" value={kind} />}
      {recurring && (kind === "weekly" || kind === "biweekly") && (
        <input type="hidden" name="anchorWeekday" value={anchorWeekday} />
      )}
      {recurring && kind === "monthly" && (
        <input type="hidden" name="anchorDay" value={anchorDay} />
      )}
      {recurring && <input type="hidden" name="endDate" value={endDate} />}
      {!recurring && <input type="hidden" name="targetDate" value={targetDate} />}

      <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
        Name
      </label>
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="bg-card text-ink rounded-xl px-4 py-3 text-sm font-bold shadow-sm outline-none"
      />

      <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
        Amount per time ($)
      </label>
      <input
        name="amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        className="bg-card text-ink tnum rounded-xl px-4 py-3 text-lg font-bold shadow-sm outline-none"
      />

      {recurring && (
        <>
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            How often?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {RECUR_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setKind(o.value)}
                className={`rounded-xl px-3 py-2.5 text-sm font-bold shadow-sm transition ${
                  kind === o.value ? "bg-primary text-white" : "bg-card text-ink/70"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {(kind === "weekly" || kind === "biweekly") && (
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
          )}

          {kind === "monthly" && (
            <select
              value={anchorDay}
              onChange={(e) => setAnchorDay(Number(e.target.value))}
              className="bg-card text-ink rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  on day {d}
                </option>
              ))}
            </select>
          )}

          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            Ends
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
        </>
      )}

      {!recurring && (
        <>
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            Date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
        </>
      )}

      {cents > 0 && (
        <div className="border-ink/10 rounded-2xl border border-dashed p-4 text-center">
          <p className="text-ink/50 text-xs">
            Your daily goes {recurring ? "from tomorrow" : ""}
          </p>
          <p className="tnum text-ink font-heading mt-1 text-xl font-bold">
            {formatCents(currentDaily)} <span className="text-ink/30">-&gt;</span>{" "}
            <span className={deficit ? "text-alert" : "text-positive"}>
              {formatCents(newDaily)}
            </span>
          </p>
        </div>
      )}

      {recurring && (
        <p className="text-ink/40 text-center text-xs">
          Changes apply to future occurrences only — past months stay as they were.
        </p>
      )}

      <button
        type="submit"
        disabled={cents <= 0}
        className="bg-primary flex h-12 items-center justify-center rounded-full text-sm font-bold text-white shadow active:scale-[0.98] disabled:opacity-40"
      >
        Save changes
      </button>
    </form>
  );
}
