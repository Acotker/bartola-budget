"use client";

import { useMemo, useState } from "react";
import {
  computePlanState,
  composePool,
  projectCash,
  type EngineInput,
} from "@/engine";
import { createIntake } from "@/app/intake-actions";
import type { IntakePayload } from "@/lib/intake-types";
import {
  Field,
  StepAssets,
  StepObligations,
  StepReview,
  StepTranches,
  dollarsToCents,
  type AssetRow,
  type ObligationRow,
  type TrancheRow,
} from "@/components/intake-steps";

const STEPS = ["Horizon", "Assets", "Money coming in", "Obligations", "Review"];

export function IntakeWizard({
  defaultStart,
  defaultEnd,
}: {
  defaultStart: string;
  defaultEnd: string;
}) {
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);

  // Step 1 — horizon
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [todayBalance, setTodayBalance] = useState("");

  // Step 2 — extra assets + buffer
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [buffer, setBuffer] = useState("");

  // Step 3 — tranches
  const [tranches, setTranches] = useState<TrancheRow[]>([]);

  // Step 4 — obligations
  const [obligations, setObligations] = useState<ObligationRow[]>([]);

  // ── Build the engine input from current state (for the live preview) ───────
  const input = useMemo<EngineInput>(() => {
    const assetInputs = [
      { balanceCents: dollarsToCents(todayBalance), spendable: true },
      ...assets.map((a) => ({
        balanceCents: dollarsToCents(a.dollars),
        spendable: a.spendable,
      })),
    ].filter((a) => a.balanceCents > 0);

    return {
      plan: { poolCents: 0, startDate, endDate },
      programs: obligations
        .filter((o) => o.name.trim() && dollarsToCents(o.dollars) > 0)
        .map((o, i) => ({
          id: `o${i}`,
          name: o.name,
          isRecurring: o.recurring,
          amountPerOccurrenceCents: dollarsToCents(o.dollars),
          recurrence: o.recurring
            ? { freq: o.freq as "monthly", anchorDay: 1 }
            : undefined,
          targetDate: !o.recurring ? o.date || undefined : undefined,
        })),
      spends: [],
      bufferCents: dollarsToCents(buffer),
      assets: assetInputs,
      tranches: tranches
        .filter((t) => dollarsToCents(t.gross) > 0 && t.date)
        .map((t, i) => ({
          id: `t${i}`,
          grossCents: dollarsToCents(t.gross),
          feesCents: dollarsToCents(t.fees),
          passthroughCents: dollarsToCents(t.passthrough),
          date: t.date,
          certainty: t.certainty,
          status: "pending" as const,
        })),
    };
  }, [startDate, endDate, todayBalance, assets, buffer, tranches, obligations]);

  const validHorizon =
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
    endDate > startDate;

  const preview = useMemo(() => {
    if (!validHorizon) return null;
    try {
      const composed = composePool(input);
      const state = computePlanState(input, startDate);
      const projection = projectCash(input, startDate);
      return {
        pool: composed.poolProjectedCents,
        upside: composed.upsideCents,
        nonSpendable: composed.nonSpendableCents,
        reserved: state.snapshot.remainingCommittedCents,
        daily: state.baselineCents,
        isDeficit: state.isDeficit,
        crunch: projection.crunch,
      };
    } catch {
      return null;
    }
  }, [input, validHorizon, startDate]);

  const precision = usePrecision({
    endDate,
    tranches,
    buffer,
    obligations,
    todayBalance,
    assets,
  });

  async function submit() {
    setPending(true);
    const payload: IntakePayload = {
      startDate,
      endDate,
      bufferCents: dollarsToCents(buffer),
      assets: [
        { label: "Checking", balanceCents: dollarsToCents(todayBalance), spendable: true },
        ...assets.map((a) => ({
          label: a.label,
          balanceCents: dollarsToCents(a.dollars),
          spendable: a.spendable,
        })),
      ].filter((a) => a.balanceCents > 0),
      tranches: tranches
        .filter((t) => dollarsToCents(t.gross) > 0 && t.date)
        .map((t) => ({
          label: t.label,
          kind: t.kind,
          grossCents: dollarsToCents(t.gross),
          feesCents: dollarsToCents(t.fees),
          passthroughCents: dollarsToCents(t.passthrough),
          expectedDate: t.date,
          certainty: t.certainty,
        })),
      obligations: obligations
        .filter((o) => o.name.trim() && dollarsToCents(o.dollars) > 0)
        .map((o) => ({
          name: o.name,
          amountPerOccurrenceCents: dollarsToCents(o.dollars),
          isRecurring: o.recurring,
          freq: o.recurring ? o.freq : undefined,
          anchorDay: o.recurring && o.freq === "monthly" ? 1 : undefined,
          targetDate: !o.recurring ? o.date : undefined,
        })),
    };
    await createIntake(payload);
  }

  const canAdvance = step > 0 || (validHorizon && dollarsToCents(todayBalance) >= 0);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-32 pt-8">
      {/* Progress + precision meter */}
      <StepHeader step={step} precision={precision} />

      <div className="mt-6 flex-1">
        {step === 0 && (
          <StepHorizon
            startDate={startDate}
            endDate={endDate}
            todayBalance={todayBalance}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            setTodayBalance={setTodayBalance}
          />
        )}
        {step === 1 && (
          <StepAssets
            assets={assets}
            setAssets={setAssets}
            buffer={buffer}
            setBuffer={setBuffer}
          />
        )}
        {step === 2 && (
          <StepTranches tranches={tranches} setTranches={setTranches} />
        )}
        {step === 3 && (
          <StepObligations
            obligations={obligations}
            setObligations={setObligations}
          />
        )}
        {step === 4 && <StepReview preview={preview} />}
      </div>

      {/* Footer nav */}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-line bg-surface/95 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-ink border-line bg-card rounded-full border px-5 py-3 text-sm font-bold"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
              className="bg-primary flex-1 rounded-full py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {step === 0 ? "Continue" : "Next"}
            </button>
          ) : (
            <button
              disabled={pending || !validHorizon}
              onClick={submit}
              className="bg-primary flex-1 rounded-full py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {pending ? "Setting up…" : "Start sipping"}
            </button>
          )}
        </div>
        {step === 0 && validHorizon && (
          <button
            onClick={submit}
            disabled={pending}
            className="text-muted mt-2 w-full text-center text-xs font-bold"
          >
            Just show me my number →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Precision meter (spec §5.6) ──────────────────────────────────────────────
function usePrecision(s: {
  endDate: string;
  tranches: TrancheRow[];
  buffer: string;
  obligations: ObligationRow[];
  todayBalance: string;
  assets: AssetRow[];
}): { score: number; band: string } {
  const filledTranches = s.tranches.filter((t) => dollarsToCents(t.gross) > 0);
  const filledObligations = s.obligations.filter(
    (o) => o.name.trim() && dollarsToCents(o.dollars) > 0,
  );
  let score = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.endDate)) score += 15;
  if (filledTranches.length >= 1) score += 20;
  if (
    filledTranches.length >= 1 &&
    filledTranches.every((t) => t.passthrough !== "" || t.fees !== "")
  )
    score += 15;
  if (dollarsToCents(s.buffer) > 0) score += 10;
  if (filledObligations.some((o) => /rent/i.test(o.name))) score += 10;
  if (filledObligations.length >= 3) score += 10;
  if (filledObligations.some((o) => !o.recurring)) score += 10;
  if (dollarsToCents(s.todayBalance) > 0 || s.assets.some((a) => a.spendable && dollarsToCents(a.dollars) > 0))
    score += 10;
  const band =
    score < 45 ? "your number is directional" : score < 80 ? "your number is solid" : "your number is dialed in";
  return { score, band };
}

function StepHeader({
  step,
  precision,
}: {
  step: number;
  precision: { score: number; band: string };
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="font-heading text-ink text-lg font-bold">Sip</span>
        <span className="text-muted text-xs font-bold">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>
      <h1 className="font-heading text-ink mt-4 text-2xl font-bold">
        {STEPS[step]}
      </h1>
      {/* precision meter */}
      <div className="mt-4">
        <div className="bg-card h-2 overflow-hidden rounded-full">
          <div
            className="bg-positive h-full rounded-full transition-all"
            style={{ width: `${Math.max(4, precision.score)}%` }}
          />
        </div>
        <p className="text-muted mt-1.5 text-xs">
          How dialed-in is your glass — {precision.band}.
        </p>
      </div>
    </div>
  );
}

// ── Step 1 — Horizon ─────────────────────────────────────────────────────────
function StepHorizon({
  startDate,
  endDate,
  todayBalance,
  setStartDate,
  setEndDate,
  setTodayBalance,
}: {
  startDate: string;
  endDate: string;
  todayBalance: string;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
  setTodayBalance: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-ink/70 text-sm leading-6">
        Let&apos;s find the window your money has to last. Two dates and what&apos;s
        in your account today.
      </p>
      <Field label="Start date">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-card text-ink w-full rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
        />
      </Field>
      <Field label="When does money start coming in again?">
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-card text-ink w-full rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
        />
        <p className="text-muted mt-1.5 text-xs leading-5">
          Not graduation — the day your first real paycheck lands. That&apos;s
          usually 6–10 weeks later, and it can move your daily number 8–12%.
        </p>
      </Field>
      <Field label="What's in your account today? ($)">
        <input
          inputMode="decimal"
          value={todayBalance}
          onChange={(e) => setTodayBalance(e.target.value)}
          placeholder="6000"
          className="bg-card text-ink tnum w-full rounded-xl px-4 py-3 text-lg font-bold shadow-sm outline-none"
        />
        <p className="text-muted mt-1.5 text-xs">
          Just your spendable checking/savings — the money that&apos;s actually
          here. Loans and income that arrive later come next.
        </p>
      </Field>
    </div>
  );
}
