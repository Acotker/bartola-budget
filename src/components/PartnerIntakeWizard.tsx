"use client";

import { useMemo, useState } from "react";
import {
  computePlanState,
  composePool,
  projectCash,
  type EngineInput,
} from "@/engine";
import { completePartnerIntake } from "@/app/partner-intake-actions";
import type { PartnerIntakePayload } from "@/lib/intake-types";
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

const STEPS = ["You", "Money coming in", "Obligations", "Review"];

/** The abbreviated intake for someone joining an existing household (§8.2) —
 *  the household's horizon is already set, so this captures only the
 *  invitee's own assets, tranches, personal obligations, and buffer. */
export function PartnerIntakeWizard({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [buffer, setBuffer] = useState("");
  const [tranches, setTranches] = useState<TrancheRow[]>([]);
  const [obligations, setObligations] = useState<ObligationRow[]>([]);

  const input = useMemo<EngineInput>(
    () => ({
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
      assets: assets
        .map((a) => ({ balanceCents: dollarsToCents(a.dollars), spendable: a.spendable }))
        .filter((a) => a.balanceCents > 0),
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
    }),
    [startDate, endDate, assets, buffer, tranches, obligations],
  );

  const preview = useMemo(() => {
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
  }, [input, startDate]);

  async function submit() {
    setPending(true);
    const payload: PartnerIntakePayload = {
      displayName,
      bufferCents: dollarsToCents(buffer),
      assets: assets
        .map((a) => ({
          label: a.label,
          balanceCents: dollarsToCents(a.dollars),
          spendable: a.spendable,
        }))
        .filter((a) => a.label.trim() && a.balanceCents > 0),
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
    await completePartnerIntake(payload);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-32 pt-8">
      <div className="flex items-center justify-between">
        <span className="font-heading text-ink text-lg font-bold">Sip</span>
        <span className="text-muted text-xs font-bold">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>
      <h1 className="font-heading text-ink mt-4 text-2xl font-bold">
        {STEPS[step]}
      </h1>

      <div className="mt-6 flex-1">
        {step === 0 && (
          <div className="space-y-5">
            <Field label="What should we call you?">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="bg-card text-ink placeholder:text-ink/30 w-full rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
              />
            </Field>
            <StepAssets
              assets={assets}
              setAssets={setAssets}
              buffer={buffer}
              setBuffer={setBuffer}
              intro="Your own accounts — what's in them today. Mark anything you won't spend these two years as untouchable."
            />
          </div>
        )}
        {step === 1 && (
          <StepTranches tranches={tranches} setTranches={setTranches} />
        )}
        {step === 2 && (
          <StepObligations
            obligations={obligations}
            setObligations={setObligations}
            intro="Anything that's just yours — a loan payment, a subscription. Shared costs are already set up."
          />
        )}
        {step === 3 && <StepReview preview={preview} />}
      </div>

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
              onClick={() => setStep((s) => s + 1)}
              className="bg-primary flex-1 rounded-full py-3.5 text-sm font-bold text-white"
            >
              Next
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={submit}
              className="bg-primary flex-1 rounded-full py-3.5 text-sm font-bold text-white disabled:opacity-40"
            >
              {pending ? "Setting up…" : "Start sipping"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
