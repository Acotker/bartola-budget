import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeView } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { logoutAction } from "@/app/auth-actions";
import { S2SNumber } from "@/components/S2SNumber";
import { formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const view = await getHomeView(userId);
  if (!view) redirect("/onboarding");

  const { state, spentToday, spentTodayTotalCents } = view;
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
            remove a Program Spend, extend your end date, or add income.
          </p>
          <Link
            href="/programs"
            className="bg-alert mt-4 inline-flex rounded-full px-4 py-2 text-sm font-bold text-white"
          >
            Review Program Spends
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

      {!deficit && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-ink/50 font-heading text-xs font-semibold uppercase tracking-wider">
              Spent today
            </h2>
            {spentToday.length > 0 && (
              <span className="tnum text-ink/70 text-sm font-bold">
                {formatCents(spentTodayTotalCents)}
              </span>
            )}
          </div>

          {spentToday.length === 0 ? (
            <p className="text-ink/50 mt-3 text-sm">
              Nothing logged yet today.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {spentToday.map((s) => (
                <li
                  key={s.id}
                  className="bg-card flex items-center justify-between rounded-xl px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-bold">
                      {s.label}
                    </p>
                    {s.note && (
                      <p className="text-ink/50 truncate text-xs">{s.note}</p>
                    )}
                  </div>
                  <span className="tnum text-ink/80 ml-3 shrink-0 text-sm font-bold">
                    {formatCents(s.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <nav className="mt-6 grid grid-cols-2 gap-3">
        <Link
          href="/programs"
          className="bg-card text-ink rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm"
        >
          Program Spends
        </Link>
        <Link
          href="/history"
          className="bg-card text-ink rounded-xl px-4 py-3 text-center text-sm font-bold shadow-sm"
        >
          Activity
        </Link>
      </nav>

      <Link
        href="/settings"
        className="text-ink/50 mt-3 flex h-11 items-center justify-center text-sm font-bold"
      >
        Plan settings
      </Link>

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
