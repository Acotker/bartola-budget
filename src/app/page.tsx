import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeView } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { logoutAction } from "@/app/auth-actions";
import { S2SNumber } from "@/components/S2SNumber";
import { CrunchStrip } from "@/components/CrunchStrip";
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

      {/* Liquidity strip — a timing heads-up, never a block (§6.2). Suppressed
          when the plan is a deficit, so it never shows alongside the banner. */}
      {view.crunch && <CrunchStrip crunch={view.crunch} />}

      {/* ZONE 3 — Ready to sip */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <div>
            <h2 className="font-heading text-ink text-base font-bold">
              Ready to sip
            </h2>
            <p className="text-muted text-xs">
              Money that&apos;s landed and waiting — sip it or leave it.
            </p>
          </div>
          {view.readyTotal > view.ready.length && (
            <Link href="/programs" className="text-primary shrink-0 text-xs font-bold">
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
          <div className="mt-3 space-y-3">
            {view.ready.map((r) => (
              <div
                key={r.id}
                className="border-line bg-card rounded-2xl border p-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-ink truncate text-sm font-bold">{r.name}</p>
                  <span className="tnum text-ink font-heading shrink-0 text-xl font-bold">
                    {formatCents(r.balanceCents)}
                  </span>
                </div>
                {/* Liquid level — how much is left in the bucket */}
                <div className="bg-surface mt-2 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-positive h-full rounded-full"
                    style={{ width: `${Math.max(4, Math.round(r.fillRatio * 100))}%` }}
                  />
                </div>
                <p className="text-muted mt-1.5 text-xs">still to sip</p>
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/log?program=${r.id}`}
                    className="bg-primary flex flex-1 items-center justify-center rounded-full py-2.5 text-xs font-bold text-white active:scale-[0.98]"
                  >
                    Sip it
                  </Link>
                  <Link
                    href={`/programs/${r.id}`}
                    className="bg-surface text-ink border-line flex items-center justify-center rounded-full border px-4 py-2.5 text-xs font-bold"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SPENT TODAY — editable, between Ready and Coming up */}
      {!deficit && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-ink text-base font-bold">
              Spent today
            </h2>
            {view.spentToday.length > 0 && (
              <span className="tnum text-ink/70 text-sm font-bold">
                {formatCents(view.spentTodayTotalCents)}
              </span>
            )}
          </div>
          {view.spentToday.length === 0 ? (
            <p className="text-muted mt-3 text-sm">Nothing sipped yet today.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {view.spentToday.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/spend/${s.id}`}
                    className="bg-card border-line flex items-center justify-between rounded-xl border px-4 py-3 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-bold">
                        {s.note ?? s.label}
                      </p>
                      {s.note && (
                        <p className="text-muted truncate text-xs">{s.label}</p>
                      )}
                    </div>
                    <span className="tnum text-ink ml-3 flex shrink-0 items-center gap-1 text-sm font-bold">
                      {formatCents(s.amountCents)}
                      <span className="text-muted text-xs">›</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ZONE 4 — Coming up */}
      {view.comingUp.length > 0 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-ink text-base font-bold">Coming up</h2>
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

      {/* Navigation — given real weight */}
      <nav className="mt-8 grid grid-cols-3 gap-3">
        <NavTile href="/programs" icon="📊" label="Program Spends" />
        <NavTile href="/history" icon="🧾" label="Activity" />
        <NavTile href="/settings" icon="⚙️" label="Plan settings" />
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

function NavTile({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="bg-card border-line flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3.5 text-center shadow-sm active:scale-[0.98]"
    >
      <span className="text-lg leading-none">{icon}</span>
      <span className="text-ink text-[11px] font-bold leading-tight">
        {label}
      </span>
    </Link>
  );
}
