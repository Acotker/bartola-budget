import Link from "next/link";
import { redirect } from "next/navigation";
import { getProgramsView } from "@/lib/data";
import { formatCents, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const view = await getProgramsView();
  if (!view) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-ink text-2xl font-semibold">Budgets</h1>
        <Link href="/" className="text-ink/50 text-sm font-bold">
          Done
        </Link>
      </div>
      <p className="text-ink/50 mt-1 text-sm">
        Money set aside from your pool. Spending here never touches your daily.
      </p>

      <ul className="mt-6 space-y-3">
        {view.cards.map((c) => {
          const available = c.balanceCents;
          return (
            <li key={c.id} className="bg-card rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-ink font-bold">{c.name}</p>
                {c.nextOccurrence && (
                  <span className="text-ink/40 text-xs">
                    next {formatShortDate(c.nextOccurrence)}
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Reserved" value={formatCents(c.reservedTotalCents)} />
                <Stat label="Spent" value={formatCents(c.spentCents)} />
                <Stat
                  label="Available"
                  value={formatCents(available)}
                  positive={available >= 0}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div>
      <p
        className={`tnum text-sm font-bold ${
          positive === undefined
            ? "text-ink"
            : positive
              ? "text-positive"
              : "text-alert"
        }`}
      >
        {value}
      </p>
      <p className="text-ink/40 text-[11px] uppercase tracking-wide">{label}</p>
    </div>
  );
}
