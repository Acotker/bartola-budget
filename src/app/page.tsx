import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeView } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { logoutAction } from "@/app/auth-actions";
import { S2SNumber } from "@/components/S2SNumber";
import { formatCents, formatLongDate, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const view = await getHomeView(userId);
  if (!view) redirect("/onboarding");

  const { state, asOf, daysRemaining, upcoming } = view;
  const deficit = state.isDeficit;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-28 pt-10">
      <div className="flex items-start justify-between">
        <p className="text-ink/60 text-sm font-bold uppercase tracking-wider">
          {deficit ? "Plan needs attention" : "Safe to spend today"}
        </p>
        <form action={logoutAction}>
          <button className="text-ink/40 text-xs font-bold">Log out</button>
        </form>
      </div>

      {deficit ? (
        <div className="border-alert/30 bg-alert/5 mt-4 rounded-2xl border p-5">
          <p className="text-alert font-heading text-2xl font-bold">
            This plan isn&apos;t viable as set up
          </p>
          <p className="text-ink/70 mt-2 text-sm leading-6">
            Your committed spending is larger than the money left for the days
            remaining. Nothing is blocked — here&apos;s how to fix it: trim or
            remove a budget, extend your end date, or add income.
          </p>
          <Link
            href="/programs"
            className="bg-alert mt-4 inline-flex rounded-full px-4 py-2 text-sm font-bold text-white"
          >
            Review budgets
          </Link>
        </div>
      ) : (
        <div className="text-ink mt-3">
          <S2SNumber cents={state.s2sBalanceCents} />
        </div>
      )}

      {!deficit && (
        <p className="text-ink/60 mt-4 text-sm">
          <span className="text-positive font-bold">
            +{formatCents(state.baselineCents)}
          </span>{" "}
          added to your Safe-to-Spend each day
        </p>
      )}

      <div className="text-ink/60 mt-8 flex items-center justify-between text-sm">
        <span>{formatLongDate(asOf)}</span>
        <span className="tnum">{daysRemaining} days left</span>
      </div>

      <section className="mt-6">
        <h2 className="text-ink/50 font-heading text-xs font-semibold uppercase tracking-wider">
          Coming up
        </h2>
        <ul className="mt-3 space-y-2">
          {upcoming.map((o) => (
            <li
              key={`${o.name}-${o.date}`}
              className="bg-card flex items-center justify-between rounded-xl px-4 py-3 shadow-sm"
            >
              <div>
                <p className="text-ink text-sm font-bold">{o.name}</p>
                <p className="text-ink/50 text-xs">{formatShortDate(o.date)}</p>
              </div>
              <span className="tnum text-ink/80 text-sm font-bold">
                {formatCents(o.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <nav className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/programs"
          className="bg-card text-ink rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm"
        >
          Budgets
        </Link>
        <Link
          href="/history"
          className="bg-card text-ink rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm"
        >
          Activity
        </Link>
      </nav>

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md px-6 pb-6">
        <Link
          href="/log"
          className="bg-primary flex h-14 w-full items-center justify-center rounded-full text-base font-bold text-white shadow-lg transition-transform active:scale-[0.98]"
        >
          Log a spend
        </Link>
      </div>
    </main>
  );
}
