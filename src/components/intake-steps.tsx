"use client";

// Shared building blocks for the financial-intake wizards — the full 5-step
// IntakeWizard (new household) and the abbreviated PartnerIntakeWizard (joining
// an existing household, §8.2). Kept here so "your own assets, tranches,
// obligations, and buffer" is defined once and behaves identically for both.

import { formatCents, formatShortDate } from "@/lib/format";

export interface AssetRow { label: string; dollars: string; spendable: boolean }
export interface TrancheRow {
  label: string;
  kind: string;
  gross: string;
  passthrough: string;
  fees: string;
  date: string;
  certainty: "confirmed" | "likely" | "hoped";
}
export interface ObligationRow {
  name: string;
  dollars: string;
  recurring: boolean;
  freq: string;
  date: string; // one-time only
}

export const dollarsToCents = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

export const TRANCHE_KINDS = [
  ["loan_disbursement", "Loan disbursement"],
  ["stipend", "Stipend"],
  ["scholarship", "Scholarship"],
  ["internship_income", "Internship income"],
  ["gift", "Gift"],
  ["tax_refund", "Tax refund"],
  ["other", "Other"],
] as const;

export const COMMON_OBLIGATIONS = [
  "Rent",
  "Utilities",
  "Phone & internet",
  "Health insurance",
  "Groceries",
  "Transport",
  "Subscriptions",
];

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border-line rounded-xl border px-3 py-2.5">
      <p className="tnum text-ink text-base font-bold">{value}</p>
      <p className="text-muted text-[11px] font-bold uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

// ── Assets + buffer ───────────────────────────────────────────────────────────
export function StepAssets({
  assets,
  setAssets,
  buffer,
  setBuffer,
  intro,
}: {
  assets: AssetRow[];
  setAssets: (v: AssetRow[]) => void;
  buffer: string;
  setBuffer: (v: string) => void;
  intro?: string;
}) {
  const add = () =>
    setAssets([...assets, { label: "", dollars: "", spendable: true }]);
  const update = (i: number, patch: Partial<AssetRow>) =>
    setAssets(assets.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => setAssets(assets.filter((_, j) => j !== i));

  return (
    <div className="space-y-5">
      <p className="text-ink/70 text-sm leading-6">
        {intro ??
          "Any other accounts? Mark anything you won't spend these two years — an emergency fund, retirement — as untouchable, so it doesn't inflate your number."}
      </p>
      {assets.map((a, i) => (
        <div key={i} className="bg-card border-line space-y-3 rounded-2xl border p-4">
          <input
            value={a.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Account name (e.g. checking)"
            className="bg-surface text-ink w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          />
          <input
            inputMode="decimal"
            value={a.dollars}
            onChange={(e) => update(i, { dollars: e.target.value })}
            placeholder="Balance ($)"
            className="bg-surface text-ink tnum w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
          />
          <div className="flex items-center justify-between">
            <label className="text-ink flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.spendable}
                onChange={(e) => update(i, { spendable: e.target.checked })}
              />
              For living these 2 years
            </label>
            <button
              onClick={() => remove(i)}
              className="text-alert text-xs font-bold"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="border-line text-ink w-full rounded-xl border border-dashed py-3 text-sm font-bold"
      >
        + Add an account
      </button>
      <Field label="Below what balance do you start losing sleep? ($)">
        <input
          inputMode="decimal"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          placeholder="1000"
          className="bg-card text-ink tnum w-full rounded-xl px-4 py-3 text-lg font-bold shadow-sm outline-none"
        />
        <p className="text-muted mt-1.5 text-xs">
          Your safety floor. It&apos;s set aside first and never counted in your
          daily sip.
        </p>
      </Field>
    </div>
  );
}

// ── Tranches ──────────────────────────────────────────────────────────────────
export function StepTranches({
  tranches,
  setTranches,
}: {
  tranches: TrancheRow[];
  setTranches: (v: TrancheRow[]) => void;
}) {
  const add = () =>
    setTranches([
      ...tranches,
      {
        label: "",
        kind: "loan_disbursement",
        gross: "",
        passthrough: "",
        fees: "",
        date: "",
        certainty: "confirmed",
      },
    ]);
  const update = (i: number, patch: Partial<TrancheRow>) =>
    setTranches(tranches.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => setTranches(tranches.filter((_, j) => j !== i));

  return (
    <div className="space-y-5">
      <p className="text-ink/70 text-sm leading-6">
        The money that arrives later — loans, a stipend, an internship. We count
        the part that actually reaches your account, so your daily number is
        steady instead of spiking when a check lands.
      </p>
      {tranches.map((t, i) => {
        const net = Math.max(
          0,
          dollarsToCents(t.gross) - dollarsToCents(t.passthrough) - dollarsToCents(t.fees),
        );
        return (
          <div key={i} className="bg-card border-line space-y-3 rounded-2xl border p-4">
            <select
              value={t.kind}
              onChange={(e) => update(i, { kind: e.target.value })}
              className="bg-surface text-ink w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            >
              {TRANCHE_KINDS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <input
              inputMode="decimal"
              value={t.gross}
              onChange={(e) => update(i, { gross: e.target.value })}
              placeholder="Gross amount ($)"
              className="bg-surface text-ink tnum w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
            />
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                value={t.passthrough}
                onChange={(e) => update(i, { passthrough: e.target.value })}
                placeholder="School takes ($)"
                className="bg-surface text-ink tnum w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              />
              <input
                inputMode="decimal"
                value={t.fees}
                onChange={(e) => update(i, { fees: e.target.value })}
                placeholder="Fees ($)"
                className="bg-surface text-ink tnum w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>
            {dollarsToCents(t.gross) > 0 && (
              <p className="text-ink text-sm">
                You receive{" "}
                <span className="text-positive font-bold">{formatCents(net)}</span>
              </p>
            )}
            <input
              type="date"
              value={t.date}
              onChange={(e) => update(i, { date: e.target.value })}
              className="bg-surface text-ink w-full rounded-xl px-3 py-2.5 text-sm outline-none"
            />
            <div className="flex items-center justify-between">
              <select
                value={t.certainty}
                onChange={(e) =>
                  update(i, { certainty: e.target.value as TrancheRow["certainty"] })
                }
                className="bg-surface text-ink rounded-xl px-3 py-2 text-sm outline-none"
              >
                <option value="confirmed">Confirmed</option>
                <option value="likely">Likely</option>
                <option value="hoped">Hoped (not counted yet)</option>
              </select>
              <button
                onClick={() => remove(i)}
                className="text-alert text-xs font-bold"
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
      <button
        onClick={add}
        className="border-line text-ink w-full rounded-xl border border-dashed py-3 text-sm font-bold"
      >
        + Add incoming money
      </button>
    </div>
  );
}

// ── Obligations ───────────────────────────────────────────────────────────────
export function StepObligations({
  obligations,
  setObligations,
  intro,
}: {
  obligations: ObligationRow[];
  setObligations: (v: ObligationRow[]) => void;
  intro?: string;
}) {
  const add = (name = "") =>
    setObligations([
      ...obligations,
      { name, dollars: "", recurring: true, freq: "monthly", date: "" },
    ]);
  const update = (i: number, patch: Partial<ObligationRow>) =>
    setObligations(obligations.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const remove = (i: number) =>
    setObligations(obligations.filter((_, j) => j !== i));

  const used = new Set(obligations.map((o) => o.name));

  return (
    <div className="space-y-5">
      <p className="text-ink/70 text-sm leading-6">
        {intro ??
          "The bills you already know are coming. Tap to add — set the ones you have."}
      </p>
      <div className="flex flex-wrap gap-2">
        {COMMON_OBLIGATIONS.filter((n) => !used.has(n)).map((n) => (
          <button
            key={n}
            onClick={() => add(n)}
            className="border-line text-ink bg-card rounded-full border px-3 py-1.5 text-xs font-bold"
          >
            + {n}
          </button>
        ))}
      </div>
      {obligations.map((o, i) => (
        <div key={i} className="bg-card border-line space-y-3 rounded-2xl border p-4">
          <input
            value={o.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="What is it?"
            className="bg-surface text-ink w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
          />
          <input
            inputMode="decimal"
            value={o.dollars}
            onChange={(e) => update(i, { dollars: e.target.value })}
            placeholder="Amount ($)"
            className="bg-surface text-ink tnum w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => update(i, { recurring: true })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${o.recurring ? "bg-primary text-white" : "bg-surface text-ink border-line border"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => update(i, { recurring: false })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${!o.recurring ? "bg-primary text-white" : "bg-surface text-ink border-line border"}`}
            >
              One-time
            </button>
            {!o.recurring && (
              <input
                type="date"
                value={o.date}
                onChange={(e) => update(i, { date: e.target.value })}
                className="bg-surface text-ink flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              />
            )}
            <button
              onClick={() => remove(i)}
              className="text-alert ml-auto text-xs font-bold"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => add()}
        className="border-line text-ink w-full rounded-xl border border-dashed py-3 text-sm font-bold"
      >
        + Add something else
      </button>
    </div>
  );
}

// ── Review + diagnosis ────────────────────────────────────────────────────────
export interface ReviewPreview {
  pool: number;
  upside: number;
  nonSpendable: number;
  reserved: number;
  daily: number;
  isDeficit: boolean;
  crunch: { date: string; shortfallCents: number; clearsOn: string | null } | null;
}

export function StepReview({ preview }: { preview: ReviewPreview | null }) {
  if (!preview) {
    return <p className="text-muted text-sm">Add a start and end date to see your number.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="bg-card border-line rounded-2xl border p-5 text-center">
        <p className="text-muted text-xs font-bold uppercase tracking-wider">
          Your daily sip
        </p>
        {preview.isDeficit ? (
          <p className="text-alert font-heading mt-1 text-2xl font-bold">
            Doesn&apos;t add up yet
          </p>
        ) : (
          <p className="text-ink font-heading tnum mt-1 text-4xl font-bold">
            {formatCents(preview.daily)}
            <span className="text-muted text-base font-bold">/day</span>
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Projected pool" value={formatCents(preview.pool)} />
        <Tile label="Reserved for bills" value={formatCents(preview.reserved)} />
        {preview.upside > 0 && (
          <Tile label="Upside (not counted)" value={formatCents(preview.upside)} />
        )}
        {preview.nonSpendable > 0 && (
          <Tile label="Set aside" value={formatCents(preview.nonSpendable)} />
        )}
      </div>
      {preview.crunch && !preview.isDeficit && (
        <div className="border-alert/30 bg-alert/5 rounded-2xl border px-4 py-3">
          <p className="text-alert text-xs font-bold uppercase tracking-wide">
            Heads up — cash gets tight
          </p>
          <p className="text-ink mt-1 text-sm leading-6">
            Around {formatShortDate(preview.crunch.date)} you dip{" "}
            <span className="font-bold">{formatCents(preview.crunch.shortfallCents)}</span>{" "}
            below your floor
            {preview.crunch.clearsOn
              ? `, until money lands ${formatShortDate(preview.crunch.clearsOn)}.`
              : "."}{" "}
            Your daily sip is unaffected.
          </p>
        </div>
      )}
      <p className="text-muted text-center text-xs">
        You can change any of this later in Plan settings.
      </p>
    </div>
  );
}
