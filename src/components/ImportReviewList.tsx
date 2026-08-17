"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  computePlanState,
  snapshotAt,
  addDays,
  type EngineInput,
  type EngineProgramSpend,
} from "@/engine";
import type { Cadence } from "@/import";
import type { ReviewCandidate } from "@/lib/import-data";
import { confirmImportAction } from "@/app/import-actions";
import { formatCents } from "@/lib/format";

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "onetime", label: "One time" },
];

function cadenceNoun(cadence: Cadence): string {
  switch (cadence) {
    case "daily":
      return "a day";
    case "weekly":
      return "a week";
    case "biweekly":
      return "every 2 weeks";
    case "monthly":
      return "a month";
    case "onetime":
      return "once";
  }
}

interface RowState {
  checked: boolean;
  name: string;
  amount: string; // dollars, as typed
  cadence: Cadence;
}

interface Props {
  uploadId: string;
  input: EngineInput;
  asOf: string;
  planEndDate: string;
  candidates: ReviewCandidate[];
}

export function ImportReviewList({
  uploadId,
  input,
  asOf,
  planEndDate,
  candidates,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    for (const c of candidates) {
      initial[c.id] = {
        // High confidence pre-checked; "possible" shown but unchecked.
        checked: c.confidenceTier === "high" && !c.alreadyLinked,
        name: c.suggestedName,
        amount: (c.suggestedAmountCents / 100).toFixed(2),
        cadence: c.suggestedCadence,
      };
    }
    return initial;
  });

  function update(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const currentDaily = useMemo(
    () => computePlanState(input, asOf).baselineCents,
    [input, asOf],
  );

  // Live combined impact of everything currently checked — the same
  // "preview before you save" mechanism manual Program Spend creation uses.
  const { newDaily, checkedCount, isDeficit } = useMemo(() => {
    const hypothetical: EngineProgramSpend[] = [];
    let count = 0;

    for (const c of candidates) {
      const row = rows[c.id];
      if (!row?.checked) continue;
      const cents = Math.round((parseFloat(row.amount) || 0) * 100);
      if (cents <= 0) continue;
      count += 1;
      hypothetical.push({
        id: `__import_${c.id}`,
        name: row.name || c.suggestedName,
        isRecurring: row.cadence !== "onetime",
        amountPerOccurrenceCents: cents,
        recurrence:
          row.cadence === "onetime"
            ? undefined
            : {
                freq: row.cadence,
                anchorDay: c.anchorDay ?? undefined,
                anchorWeekday: c.anchorWeekday ?? undefined,
              },
        startDate: row.cadence === "onetime" ? undefined : asOf,
        endDate: row.cadence === "onetime" ? undefined : planEndDate,
        targetDate: row.cadence === "onetime" ? asOf : undefined,
        addedOn: asOf,
        status: "active",
      });
    }

    if (hypothetical.length === 0) {
      return { newDaily: currentDaily, checkedCount: 0, isDeficit: false };
    }
    const snap = snapshotAt(
      { ...input, programs: [...input.programs, ...hypothetical] },
      addDays(asOf, 1),
    );
    return {
      newDaily: snap.baselineCents,
      checkedCount: count,
      isDeficit: snap.baselineCents <= 0,
    };
  }, [candidates, rows, input, asOf, planEndDate, currentDaily]);

  async function confirm() {
    setBusy(true);
    const decisions = candidates.map((c) => {
      const row = rows[c.id];
      const cents = Math.round((parseFloat(row?.amount ?? "0") || 0) * 100);
      return {
        candidateId: c.id,
        accepted: Boolean(row?.checked) && cents > 0,
        name: row?.name,
        amountCents: cents,
        cadence: row?.cadence,
      };
    });
    await confirmImportAction(uploadId, decisions);
    setBusy(false);
    startTransition(() => router.push("/programs"));
  }

  const high = candidates.filter((c) => c.confidenceTier === "high");
  const possible = candidates.filter((c) => c.confidenceTier !== "high");
  const working = busy || pending;

  if (candidates.length === 0) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <p className="text-ink text-sm leading-6">
          We couldn&apos;t spot anything that repeats in that file. That happens
          with a short date range — a few months of history gives us more to go
          on.
        </p>
        <Link
          href="/programs/new"
          className="bg-primary flex h-12 items-center justify-center rounded-full text-sm font-bold text-white"
        >
          Add one by hand instead
        </Link>
        <Link
          href="/import"
          className="text-muted flex h-10 items-center justify-center text-sm font-bold"
        >
          Try another file
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6 pb-40">
      {high.length > 0 && (
        <section className="flex flex-col gap-3">
          {high.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              row={rows[c.id]}
              onChange={(patch) => update(c.id, patch)}
            />
          ))}
        </section>
      )}

      {possible.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted font-heading text-xs font-semibold uppercase tracking-wider">
            Maybe also these
          </h2>
          {possible.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              row={rows[c.id]}
              onChange={(patch) => update(c.id, patch)}
              secondary
            />
          ))}
        </section>
      )}

      {/* Live combined impact + confirm */}
      <div className="border-line bg-card fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t px-6 pb-6 pt-4">
        <div className="text-center">
          <p className="text-muted text-xs">Your daily sip would go</p>
          <p className="tnum text-ink font-heading mt-0.5 text-lg font-bold">
            {formatCents(currentDaily)} <span className="text-muted">→</span>{" "}
            <span className={isDeficit ? "text-alert" : "text-positive"}>
              {formatCents(newDaily)}
            </span>
          </p>
          {isDeficit && (
            <p className="text-alert mt-1 text-xs">
              That&apos;s more than this plan can cover. You can still add them,
              then adjust.
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={checkedCount === 0 || working}
          onClick={confirm}
          className="bg-primary font-heading mt-3 flex h-14 w-full items-center justify-center rounded-full text-base font-semibold text-white shadow-lg active:scale-[0.98] disabled:opacity-40"
        >
          {working
            ? "Adding…"
            : checkedCount === 0
              ? "Pick at least one"
              : `Add ${checkedCount} Program Spend${checkedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  row,
  onChange,
  secondary,
}: {
  candidate: ReviewCandidate;
  row: RowState | undefined;
  onChange: (patch: Partial<RowState>) => void;
  secondary?: boolean;
}) {
  if (!row) return null;
  const spread =
    candidate.minAmountCents !== candidate.maxAmountCents
      ? `${formatCents(candidate.minAmountCents)}–${formatCents(candidate.maxAmountCents)}`
      : null;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        row.checked ? "border-primary bg-primary/5" : "border-line bg-card"
      } ${secondary && !row.checked ? "opacity-80" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={row.checked ? "Don't add this" : "Add this"}
          onClick={() => onChange({ checked: !row.checked })}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
            row.checked
              ? "border-primary bg-primary text-white"
              : "border-line bg-surface text-transparent"
          }`}
        >
          ✓
        </button>

        <div className="min-w-0 flex-1">
          <input
            value={row.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="text-ink w-full bg-transparent text-sm font-bold outline-none"
          />

          {/* Plain-language explanation of why this amount was chosen. */}
          <p className="text-muted mt-1 text-xs leading-5">
            Seen {candidate.occurrenceCount} times
            {candidate.averageGapDays
              ? `, about ${candidate.averageGapDays} days apart`
              : ""}
            {spread ? `, between ${spread}` : ""} — we&apos;ll reserve{" "}
            <span className="text-ink font-bold">
              {formatCents(Math.round((parseFloat(row.amount) || 0) * 100))}
            </span>{" "}
            {cadenceNoun(row.cadence)}.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="border-line bg-surface flex items-center rounded-lg border px-2">
              <span className="text-muted text-xs">$</span>
              <input
                value={row.amount}
                inputMode="decimal"
                onChange={(e) =>
                  onChange({ amount: e.target.value.replace(/[^0-9.]/g, "") })
                }
                className="tnum text-ink w-16 bg-transparent px-1 py-1.5 text-sm font-bold outline-none"
              />
            </div>
            <select
              value={row.cadence}
              onChange={(e) => onChange({ cadence: e.target.value as Cadence })}
              className="border-line bg-surface text-ink rounded-lg border px-2 py-1.5 text-xs font-bold"
            >
              {CADENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
