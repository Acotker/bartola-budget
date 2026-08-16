import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSettingsView } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { updatePlanAction, addInflowAction } from "@/app/actions";
import { formatCents, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const view = await getSettingsView(userId);
  if (!view) redirect("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-12 pt-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-ink text-2xl font-semibold">
          Plan settings
        </h1>
        <Link href="/" className="text-ink/50 text-sm font-bold">
          Done
        </Link>
      </div>

      <div className="bg-card mt-6 grid grid-cols-3 gap-2 rounded-2xl p-4 text-center shadow-sm">
        <Summary label="Reserved" value={formatCents(view.reservedCents)} />
        <Summary
          label="Unallocated"
          value={formatCents(view.unallocatedCents)}
          tone={view.unallocatedCents >= 0 ? "positive" : "alert"}
        />
        <Summary label="Days left" value={`${view.daysRemaining}`} />
      </div>

      <form action={updatePlanAction} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="planId" value={view.planId} />
        <h2 className="text-ink/50 font-heading text-xs font-semibold uppercase tracking-wider">
          Pool &amp; dates
        </h2>
        <Field label="Total pool ($)">
          <input
            name="pool"
            inputMode="decimal"
            defaultValue={(view.poolCents / 100).toString()}
            className="bg-card text-ink tnum w-full rounded-xl px-4 py-3 text-sm font-bold shadow-sm outline-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start">
            <input
              name="startDate"
              type="date"
              defaultValue={view.startDate}
              className="bg-card text-ink w-full rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
            />
          </Field>
          <Field label="End">
            <input
              name="endDate"
              type="date"
              defaultValue={view.endDate}
              className="bg-card text-ink w-full rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
            />
          </Field>
        </div>
        <button
          type="submit"
          className="bg-primary mt-2 flex h-12 items-center justify-center rounded-full text-sm font-bold text-white shadow active:scale-[0.98]"
        >
          Save changes
        </button>
      </form>

      <form action={addInflowAction} className="mt-10 flex flex-col gap-3">
        <input type="hidden" name="planId" value={view.planId} />
        <h2 className="text-ink/50 font-heading text-xs font-semibold uppercase tracking-wider">
          Add income
        </h2>
        <p className="text-ink/50 -mt-1 text-xs">
          Extra income, a loan, or a gift — increases your pool from today.
        </p>
        <div className="flex gap-2">
          <input
            name="amount"
            inputMode="decimal"
            placeholder="Amount ($)"
            className="bg-card text-ink placeholder:text-ink/30 tnum flex-1 rounded-xl px-4 py-3 text-sm font-bold shadow-sm outline-none"
          />
          <button
            type="submit"
            className="border-primary text-primary rounded-full border px-5 text-sm font-bold"
          >
            Add
          </button>
        </div>
        <input
          name="note"
          placeholder="Note (optional)"
          className="bg-card text-ink placeholder:text-ink/30 rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
        />
      </form>

      {view.income.length > 0 && (
        <ul className="mt-4 space-y-2">
          {view.income.map((i, idx) => (
            <li
              key={idx}
              className="bg-card flex items-center justify-between rounded-xl px-4 py-3 shadow-sm"
            >
              <div>
                <p className="text-ink text-sm font-bold">
                  {i.note ?? "Income"}
                </p>
                <p className="text-ink/50 text-xs">{formatShortDate(i.date)}</p>
              </div>
              <span className="tnum text-positive text-sm font-bold">
                +{formatCents(i.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "alert";
}) {
  const color =
    tone === "positive" ? "text-positive" : tone === "alert" ? "text-alert" : "text-ink";
  return (
    <div>
      <p className={`tnum text-sm font-bold ${color}`}>{value}</p>
      <p className="text-ink/40 text-[11px] uppercase tracking-wide">{label}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ink/50 text-xs font-bold uppercase tracking-wider">
        {label}
      </span>
      {children}
    </label>
  );
}
