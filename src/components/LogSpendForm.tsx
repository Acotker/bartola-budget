"use client";

import { useState } from "react";
import {
  computePlanState,
  snapshotAt,
  addDays,
  type EngineInput,
} from "@/engine";
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

  // Keypad entry: build the amount string digit by digit.
  const press = (key: string) => {
    setAmount((prev) => {
      if (key === "del") return prev.slice(0, -1);
      if (key === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : prev + ".";
      }
      // Block a 3rd decimal place.
      const dot = prev.indexOf(".");
      if (dot !== -1 && prev.length - dot > 2) return prev;
      // Avoid a leading run of zeros like "0005".
      if (prev === "0") return key;
      return prev + key;
    });
  };

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const hasAmount = cents > 0;
  const activeProgram = programs.find((p) => p.id === programSpendId);

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
  const s2sChanged = preview.s2sBalanceCents !== current.s2sBalanceCents;

  // Overspend: an S2S spend larger than the Safe-to-Spend on hand. The engine
  // absorbs the overage (balance floors at 0) and spreads it across the days
  // ahead, so tomorrow's daily comes down a little. Surface that instead of a
  // reassuring $0.00 — otherwise going over looks identical to landing on zero.
  const overspendCents =
    type === "s2s" ? cents - current.s2sBalanceCents : 0;
  const isOverspend = hasAmount && overspendCents > 0;
  const tomorrowBaselineCents = isOverspend
    ? snapshotAt(previewInput, addDays(asOf, 1)).baselineCents
    : current.baselineCents;

  // A single, informative consequence line (never punitive).
  let consequence: React.ReactNode;
  if (!hasAmount) {
    consequence =
      type === "s2s"
        ? "Comes out of today's allowance."
        : "Money already set aside — your daily is untouched.";
  } else if (type === "program" && !s2sChanged) {
    consequence = (
      <>
        Comes out of{" "}
        <span className="font-bold">{activeProgram?.name ?? "a program"}</span>.
        Your daily is untouched.
      </>
    );
  } else if (isOverspend) {
    consequence = (
      <>
        <span className="text-alert font-bold">
          {formatCents(overspendCents)}
        </span>{" "}
        over Safe-to-Spend. Tomorrow&apos;s daily eases{" "}
        <span className="tnum text-ink font-bold">
          {formatCents(current.baselineCents)}
        </span>{" "}
        <span className="text-muted">→</span>{" "}
        <span className="tnum text-alert font-bold">
          {formatCents(tomorrowBaselineCents)}
        </span>{" "}
        to catch up.
      </>
    );
  } else {
    consequence = (
      <>
        Safe to spend{" "}
        <span className="tnum text-ink font-bold">
          {formatCents(current.s2sBalanceCents)}
        </span>{" "}
        <span className="text-muted">→</span>{" "}
        <span
          className={`tnum font-bold ${
            preview.isDeficit ? "text-alert" : "text-positive"
          }`}
        >
          {formatCents(preview.s2sBalanceCents)}
        </span>
      </>
    );
  }

  return (
    <form action={logSpendAction} className="flex flex-1 flex-col">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="amount" value={amount} />
      {type === "program" && (
        <input type="hidden" name="programSpendId" value={programSpendId} />
      )}

      {/* Amount + live consequence */}
      <div className="mt-4 text-center">
        <div className="font-heading text-ink tnum text-6xl font-bold tracking-tight">
          <span className={hasAmount ? "" : "text-ink/25"}>
            ${amount === "" ? "0" : amount}
          </span>
        </div>
        <p className="text-muted mt-3 min-h-[38px] px-2 text-sm leading-relaxed">
          {consequence}
        </p>
      </div>

      {/* Source: Safe-to-Spend vs a program */}
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setType("s2s")}
          className={`rounded-2xl border p-3 text-left transition ${
            type === "s2s" ? "border-primary bg-primary/8" : "border-line bg-card"
          }`}
        >
          <span className="font-heading text-ink block text-sm font-semibold">
            Safe to spend
          </span>
          <span className="text-muted mt-0.5 block text-[11.5px] leading-snug">
            Comes out of today&apos;s allowance
          </span>
        </button>
        <button
          type="button"
          onClick={() => setType("program")}
          className={`rounded-2xl border p-3 text-left transition ${
            type === "program"
              ? "border-primary bg-primary/8"
              : "border-line bg-card"
          }`}
        >
          <span className="font-heading text-ink block text-sm font-semibold">
            A program
          </span>
          <span className="text-muted mt-0.5 block text-[11.5px] leading-snug">
            Money already set aside
          </span>
        </button>
      </div>

      {/* Which program (chips) */}
      {type === "program" && (
        <div className="mt-3">
          {programs.length === 0 ? (
            <p className="text-muted text-center text-xs">
              No programs yet — add one from Programs first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {programs.map((p) => {
                const selected = p.id === programSpendId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProgramSpendId(p.id)}
                    className={`rounded-full border px-3.5 py-2 text-sm font-bold transition ${
                      selected
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-card text-ink"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Optional note */}
      <input
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="bg-card text-ink placeholder:text-muted/60 border-line mt-3 rounded-xl border px-4 py-3 text-sm outline-none"
      />

      <div className="flex-1" />

      {/* Keypad */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <Key key={n} onPress={() => press(n)}>
            {n}
          </Key>
        ))}
        <Key muted onPress={() => press(".")}>
          .
        </Key>
        <Key onPress={() => press("0")}>0</Key>
        <Key muted onPress={() => press("del")}>
          ⌫
        </Key>
      </div>

      <button
        type="submit"
        disabled={!hasAmount || (type === "program" && programs.length === 0)}
        className="bg-primary font-heading mt-4 flex h-14 items-center justify-center rounded-full text-base font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40"
      >
        Save spend
      </button>
    </form>
  );
}

function Key({
  children,
  onPress,
  muted,
}: {
  children: React.ReactNode;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`font-heading border-line h-[52px] rounded-2xl border text-xl font-semibold transition active:scale-[0.97] ${
        muted ? "bg-surface text-ink/70" : "bg-card text-ink"
      }`}
    >
      {children}
    </button>
  );
}
