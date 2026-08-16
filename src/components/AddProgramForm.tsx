"use client";

import { useState } from "react";
import Link from "next/link";
import {
  computePlanState,
  snapshotAt,
  addDays,
  type EngineInput,
  type EngineProgramSpend,
} from "@/engine";
import { createProgramAction } from "@/app/actions";
import { formatCents } from "@/lib/format";

interface Props {
  planId: string;
  input: EngineInput;
  asOf: string;
}

export function AddProgramForm({ planId, input, asOf }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"recurring" | "onetime">("recurring");
  const [freq, setFreq] = useState<"weekly" | "biweekly" | "monthly">("monthly");
  const [anchorDay, setAnchorDay] = useState("1");
  const [targetDate, setTargetDate] = useState("");

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const tomorrow = addDays(asOf, 1);
  const currentDaily = computePlanState(input, asOf).baselineCents;

  let newDaily = currentDaily;
  let deficit = false;
  if (cents > 0) {
    const hypothetical: EngineProgramSpend =
      kind === "onetime"
        ? {
            id: "__preview__",
            name: name || "New",
            isRecurring: false,
            amountPerOccurrenceCents: cents,
            targetDate: targetDate || input.plan.endDate,
            addedOn: asOf,
          }
        : {
            id: "__preview__",
            name: name || "New",
            isRecurring: true,
            amountPerOccurrenceCents: cents,
            recurrence: {
              freq,
              anchorDay: freq === "monthly" ? parseInt(anchorDay) || 1 : undefined,
            },
            addedOn: asOf,
          };
    const previewInput: EngineInput = {
      ...input,
      programs: [...input.programs, hypothetical],
    };
    const snap = snapshotAt(previewInput, tomorrow);
    newDaily = snap.baselineCents;
    deficit = newDaily <= 0;
  }

  return (
    <form action={createProgramAction} className="flex flex-1 flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "recurring" && <input type="hidden" name="freq" value={freq} />}
      {kind === "recurring" && freq === "monthly" && (
        <input type="hidden" name="anchorDay" value={anchorDay} />
      )}
      {kind === "onetime" && (
        <input type="hidden" name="targetDate" value={targetDate} />
      )}

      <div className="flex flex-col gap-1">
        <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
          Name
        </label>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rent, Groceries, Thanksgiving trip"
          className="bg-card text-ink placeholder:text-ink/30 rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
          Amount per time ($)
        </label>
        <input
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="0.00"
          className="bg-card text-ink placeholder:text-ink/30 tnum rounded-xl px-4 py-3 text-lg font-bold shadow-sm outline-none"
        />
      </div>

      <div className="bg-ink/5 grid grid-cols-2 gap-1 rounded-full p-1">
        <button
          type="button"
          onClick={() => setKind("recurring")}
          className={`rounded-full py-2.5 text-sm font-bold transition ${
            kind === "recurring" ? "bg-card text-ink shadow" : "text-ink/50"
          }`}
        >
          Repeating
        </button>
        <button
          type="button"
          onClick={() => setKind("onetime")}
          className={`rounded-full py-2.5 text-sm font-bold transition ${
            kind === "onetime" ? "bg-card text-ink shadow" : "text-ink/50"
          }`}
        >
          One-time
        </button>
      </div>

      {kind === "recurring" ? (
        <div className="flex gap-2">
          <select
            value={freq}
            onChange={(e) =>
              setFreq(e.target.value as "weekly" | "biweekly" | "monthly")
            }
            className="bg-card text-ink flex-1 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </select>
          {freq === "monthly" && (
            <input
              value={anchorDay}
              onChange={(e) =>
                setAnchorDay(e.target.value.replace(/[^0-9]/g, "") || "1")
              }
              inputMode="numeric"
              aria-label="Day of month"
              className="bg-card text-ink tnum w-20 rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm outline-none"
            />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            Date
          </label>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
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

      <div className="mt-auto flex flex-col gap-3 pt-4">
        <button
          type="submit"
          disabled={cents <= 0}
          className="bg-primary flex h-14 items-center justify-center rounded-full text-base font-bold text-white shadow-lg active:scale-[0.98] disabled:opacity-40"
        >
          Add budget
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
