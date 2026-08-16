"use client";

import { useState } from "react";
import Link from "next/link";
import { computePlanState, type EngineInput } from "@/engine";
import { logSpendAction } from "@/app/actions";
import { formatCents } from "@/lib/format";

interface Props {
  planId: string;
  input: EngineInput;
  asOf: string;
  programs: { id: string; name: string }[];
}

export function LogSpendForm({ planId, input, asOf, programs }: Props) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"s2s" | "program">("s2s");
  const [programSpendId, setProgramSpendId] = useState(programs[0]?.id ?? "");
  const [note, setNote] = useState("");

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const current = computePlanState(input, asOf);
  const previewInput: EngineInput = {
    ...input,
    spends: [
      ...input.spends,
      {
        id: "__preview__",
        date: asOf,
        amountCents: cents,
        type,
        programSpendId: type === "program" ? programSpendId : undefined,
      },
    ],
  };
  const preview = computePlanState(previewInput, asOf);
  const showPreview = cents > 0;

  return (
    <form action={logSpendAction} className="flex flex-1 flex-col">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="type" value={type} />
      {type === "program" && (
        <input type="hidden" name="programSpendId" value={programSpendId} />
      )}

      <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
        Amount
      </label>
      <div className="mt-2 flex items-center">
        <span className="text-ink/40 font-heading text-4xl font-bold">$</span>
        <input
          name="amount"
          inputMode="decimal"
          autoFocus
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className="tnum font-heading text-ink placeholder:text-ink/20 w-full bg-transparent text-6xl font-extrabold outline-none"
        />
      </div>

      <div className="bg-ink/5 mt-8 grid grid-cols-2 gap-1 rounded-full p-1">
        <button
          type="button"
          onClick={() => setType("s2s")}
          className={`rounded-full py-3 text-sm font-bold transition ${
            type === "s2s" ? "bg-card text-ink shadow" : "text-ink/50"
          }`}
        >
          Safe-to-Spend
        </button>
        <button
          type="button"
          onClick={() => setType("program")}
          className={`rounded-full py-3 text-sm font-bold transition ${
            type === "program" ? "bg-card text-ink shadow" : "text-ink/50"
          }`}
        >
          A budget
        </button>
      </div>
      <p className="text-ink/50 mt-2 text-center text-xs">
        {type === "s2s"
          ? "Comes out of your everyday allowance."
          : "Comes out of a set-aside budget — your daily is untouched."}
      </p>

      {type === "program" && (
        <select
          value={programSpendId}
          onChange={(e) => setProgramSpendId(e.target.value)}
          className="bg-card text-ink mt-4 rounded-xl px-4 py-3 text-sm font-bold shadow-sm"
        >
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <input
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="bg-card text-ink placeholder:text-ink/30 mt-4 rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
      />

      {showPreview && (
        <div className="border-ink/10 mt-6 rounded-2xl border border-dashed p-4 text-center">
          <p className="text-ink/50 text-xs">Your Safe-to-Spend after this</p>
          <p className="tnum text-ink font-heading mt-1 text-2xl font-bold">
            {formatCents(current.s2sBalanceCents)}{" "}
            <span className="text-ink/30">-&gt;</span>{" "}
            <span className={preview.isDeficit ? "text-alert" : "text-positive"}>
              {formatCents(preview.s2sBalanceCents)}
            </span>
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <button
          type="submit"
          disabled={!showPreview}
          className="bg-primary flex h-14 items-center justify-center rounded-full text-base font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-40"
        >
          Save spend
        </button>
        <Link
          href="/"
          className="text-ink/50 flex h-10 items-center justify-center text-sm font-bold"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
