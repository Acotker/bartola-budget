import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeView } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { logoutAction } from "@/app/auth-actions";
import { S2SNumber } from "@/components/S2SNumber";
import { formatCents, formatShortDate, formatDateYear } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const view = await getHomeView(userId);
  if (!view) redirect("/onboarding");

  const params = await searchParams;
  const sipped =
    typeof params.sipped === "string" ? parseInt(params.sipped, 10) : null;
  const sipKind = typeof params.kind === "string" ? params.kind : null;
  const welcome = params.welcome === "1";
  const deficit = view.state.isDeficit;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-28 pt-8">
      {/* Brand bar */}
      <div className="flex items-center justify-between">
        <span className="font-heading text-ink text-lg font-bold tracking-tight">
          Sip
        </span>
        <form action={logoutAction}>
          <button className="text-muted text-xs font-bold">Log out</button>
        </form>
      </div>

      {/* Onboarding reveal */}
      {welcome && !deficit && (
        <div className="border-positive/30 bg-positive/10 mt-4 rounded-2xl border px-4 py-3">
          <p className="text-ink text-sm leading-6">
            You can sip{" "}
            <span className="font-bold">{formatCents(view.dailySipCents)}</span> a
            day. Every day until {formatDateYear(view.input.plan.endDate)}.
          </p>
        </div>
      )}

      {/* Sip confirmation flash */}
      {sipped != null && Number.isFinite(sipped) && (
        <div className="border-positive/30 bg-positive/10 mt-4 rounded-2xl border px-4 py-3">
          <p className="text-ink text-sm">
            {sipKind === "program" ? (
              <>Sipped {formatCents(sipped)}.</>
            ) : (
              <>
                Sipped {formatCents(sipped)}.{" "}
                <span className="font-bold">
                  {formatCents(view.safeTodayCents)}
                </span>{" "}
                left to sip today.
              </>
            )}
          </p>
        </div>
      )}

      {/* ZONE 1 — hero */}
      {deficit ? (
        <section className="border-alert/30 bg-alert/5 mt-5 rounded-2xl border p-5">
          <p className="font-heading text-ink text-xl font-bold">
            This plan doesn&apos;t add up yet
          </p>
          <p className="text-ink/70 mt-2 text-sm leading-6">
            Your committed spending is larger than the money left for the days
            you have. Nothing&apos;s blocked — trim or end a Program Spend,
            extend your end date, or add income.
          </p>
          <Link
            href="/programs"
            className="bg-alert mt-4 inline-flex rounded-full px-4 py-2 text-sm font-bold text-white"
          >
            Review Program Spends
          </Link>
        </section>
      ) : (
        <section className="mt-5">
          <p className="text-muted text-sm font-bold uppercase tracking-wider">
            Safe to spend today
          </p>
          <div className="text-ink mt-1">
            <S2SNumber cents={view.safeTodayCents} />
          </div>
          <p className="text-muted mt-2 text-sm">
            Your daily sip is{" "}
            <span className="text-positive font-bold">
              {formatCents(view.dailySipCents)}
            </span>
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Stat label="Spent today" value={formatCents(view.spentTodayS2sCents)} />
            <Stat label="Carried over" value={formatCents(view.carriedOverCents)} />
          </div>
        </section>
      )}

      {/* ZONE 3 — Ready to sip */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-ink text-sm font-semibold uppercase tracking-wider">
            Ready to sip
          </h2>
          {view.readyTotal > view.ready.length && (
            <Link href="/programs" className="text-primary text-xs font-bold">
              See all {view.readyTotal}
            </Link>
          )}
        </div>

        {view.ready.length === 0 ? (
          <p className="text-muted mt-3 text-sm">
            Nothing ready to sip right now.
            {view.nextOccurrenceDate &&
              ` Your next one lands ${formatShortDate(view.nextOccurrenceDate)}.`}
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {view.ready.map((r) => (
              <div
                key={r.id}
                className="border-line bg-card relative overflow-hidden rounded-2xl border shadow-sm"
              >
                {/* Liquid fill level = remaining */}
                <div
                  aria-hidden
                  className="bg-positive/12 border-positive/40 absolute inset-x-0 bottom-0 border-t"
                  style={{ height: `${Math.round(r.fillRatio * 100)}%` }}
                />
                <Link
                  href={`/log?program=${r.id}`}
                  className="relative flex items-center justify-between px-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-bold">{r.name}</p>
                    <p className="text-muted text-xs">tap to sip</p>
                  </div>
                  <span className="tnum text-ink font-heading ml-3 shrink-0 text-lg font-bold">
                    {formatCents(r.balanceCents)}
                  </span>
                </Link>
                <Link
                  href={`/programs/${r.id}`}
                  className="text-muted absolute right-2 top-2 z-10 text-[11px] font-bold"
                >
                  details ›
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ZONE 4 — Coming up */}
      {view.comingUp.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-ink text-sm font-semibold uppercase tracking-wider">
              Coming up
            </h2>
            <Link href="/programs" className="text-primary text-xs font-bold">
              See all
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {view.comingUp.map((o) => (
              <li
                key={`${o.name}-${o.date}`}
                className="flex items-center justify-between px-1 py-1.5"
              >
                <div>
                  <span className="text-ink text-sm font-bold">{o.name}</span>
                  <span className="text-muted ml-2 text-xs">
                    {formatShortDate(o.date)}
                  </span>
                </div>
                <span className="tnum text-muted text-sm font-bold">
                  {formatCents(o.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Secondary actions (behind the primary) */}
      <nav className="text-muted mt-8 flex items-center justify-center gap-4 text-xs font-bold">
        <Link href="/programs">Program Spends</Link>
        <span className="text-line">·</span>
        <Link href="/history">Activity</Link>
        <span className="text-line">·</span>
        <Link href="/settings">Plan settings</Link>
      </nav>

      {/* ZONE 2 — primary action (thumb-reachable) */}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md px-6 pb-6">
        <Link
          href="/log"
          className="bg-primary font-heading flex h-14 w-full items-center justify-center rounded-full text-base font-semibold text-white shadow-lg transition-transform active:scale-[0.98]"
        >
          Sip it
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border-line rounded-xl border px-3 py-2.5 shadow-sm">
      <p className="tnum text-ink text-base font-bold">{value}</p>
      <p className="text-muted text-[11px] font-bold uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}
