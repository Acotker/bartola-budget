import Link from "next/link";
import { redirect } from "next/navigation";
import { getProgramDetail } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { cancelProgramAction } from "@/app/actions";
import { addDays } from "@/engine";
import { EditProgramForm } from "@/components/EditProgramForm";
import { formatCents, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const detail = await getProgramDetail(userId, id);
  if (!detail) redirect("/programs");

  const { program, asOf } = detail;
  const cadence = program.isRecurring
    ? (program.recurrence?.freq ?? "recurring")
    : `one-time · ${program.targetDate ?? ""}`;
  const upcoming = detail.occurrences.filter((d) => d > asOf).slice(0, 6);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-12 pt-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-ink text-2xl font-semibold">
          {program.name}
        </h1>
        <Link href="/programs" className="text-ink/50 text-sm font-bold">
          Back
        </Link>
      </div>
      <p className="text-ink/50 mt-1 text-sm capitalize">{cadence}</p>

      <div className="bg-card mt-6 grid grid-cols-3 gap-2 rounded-2xl p-4 text-center shadow-sm">
        <Stat label="Reserved" value={formatCents(detail.reservedTotalCents)} />
        <Stat label="Spent" value={formatCents(detail.spentCents)} />
        <Stat
          label="Available"
          value={formatCents(detail.balanceCents)}
          tone={detail.balanceCents >= 0 ? "positive" : "alert"}
        />
      </div>

      <section className="mt-8">
        <h2 className="text-ink/50 font-heading mb-3 text-xs font-semibold uppercase tracking-wider">
          Edit
        </h2>
        <EditProgramForm program={program} input={detail.input} asOf={asOf} />
      </section>

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-ink/50 font-heading text-xs font-semibold uppercase tracking-wider">
            Upcoming occurrences
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {upcoming.map((d) => (
              <span
                key={d}
                className="bg-card text-ink/70 rounded-full px-3 py-1 text-xs font-bold shadow-sm"
              >
                {formatShortDate(d)}
              </span>
            ))}
          </div>
        </section>
      )}

      {detail.spends.length > 0 && (
        <section className="mt-8">
          <h2 className="text-ink/50 font-heading text-xs font-semibold uppercase tracking-wider">
            Spending
          </h2>
          <ul className="mt-3 space-y-2">
            {detail.spends.map((s) => (
              <li
                key={s.id}
                className="bg-card flex items-center justify-between rounded-xl px-4 py-3 shadow-sm"
              >
                <span className="text-ink/70 text-sm">
                  {s.note ?? formatShortDate(s.date)}
                </span>
                <span className="tnum text-ink text-sm font-bold">
                  {formatCents(s.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={cancelProgramAction} className="mt-10 flex flex-col gap-2">
        <input type="hidden" name="programId" value={program.id} />
        <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
          End it from
        </label>
        <input
          type="date"
          name="fromDate"
          defaultValue={addDays(asOf, 1)}
          className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
        />
        <button className="text-alert mt-1 flex h-11 w-full items-center justify-center text-sm font-bold">
          End this Program Spend
        </button>
        <p className="text-ink/40 text-center text-xs">
          Occurrences before this date — and anything logged — are kept.
        </p>
      </form>
    </main>
  );
}

function Stat({
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
