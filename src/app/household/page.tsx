import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUserId } from "@/lib/auth";
import { getHouseholdView } from "@/lib/data";
import { createInviteAction } from "@/app/invite-actions";
import { logAdvanceAction, settleAdvanceAction } from "@/app/advance-actions";
import { agreeToSplitAction } from "@/app/split-actions";
import { ProposeSharedCostForm } from "@/components/ProposeSharedCostForm";
import { formatCents, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const view = await getHouseholdView(userId);
  const params = await searchParams;
  const inviteToken = typeof params.invite === "string" ? params.invite : null;
  const welcome = params.welcome === "1";

  let inviteUrl: string | null = null;
  if (inviteToken) {
    const h = await headers();
    const host = h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "http";
    inviteUrl = host
      ? `${proto}://${host}/join/${inviteToken}`
      : `/join/${inviteToken}`;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-28 pt-8">
      <div className="flex items-center justify-between">
        <span className="font-heading text-ink text-lg font-bold tracking-tight">
          Household
        </span>
        <Link href="/" className="text-muted text-xs font-bold">
          Home
        </Link>
      </div>

      {welcome && (
        <div className="border-positive/30 bg-positive/10 mt-4 rounded-2xl border px-4 py-3">
          <p className="text-ink text-sm leading-6">
            You&apos;re in. Your numbers are added to the household below.
          </p>
        </div>
      )}

      {!view ? (
        <section className="mt-8">
          <h1 className="font-heading text-ink text-2xl font-bold">
            You&apos;re flying solo
          </h1>
          <p className="text-ink/70 mt-2 text-sm leading-6">
            Sip works for two. Invite your partner to share rent, groceries, and
            travel — you each keep your own Safe-to-Spend, plus one shared
            number for the things you do together.
          </p>

          {inviteUrl ? (
            <div className="bg-card border-line mt-6 rounded-2xl border p-4">
              <p className="text-muted text-xs font-bold uppercase tracking-wider">
                Share this link
              </p>
              <p className="text-ink tnum mt-2 break-all text-sm">{inviteUrl}</p>
              <p className="text-muted mt-2 text-xs">
                They&apos;ll log in or sign up, see what you&apos;ve set up, and
                add their own numbers — no need to redo any of this.
              </p>
            </div>
          ) : (
            <form action={createInviteAction} className="mt-6">
              <button
                type="submit"
                className="bg-primary flex h-12 w-full items-center justify-center rounded-full text-sm font-bold text-white shadow-lg active:scale-[0.98]"
              >
                Invite your partner
              </button>
            </form>
          )}
        </section>
      ) : (
        <>
          {/* Shared Safe-to-Spend — the "can we afford dinner?" number */}
          {view.shared && (
            <section className="border-primary/25 bg-primary/5 mt-6 rounded-2xl border p-5">
              <p className="text-muted text-xs font-bold uppercase tracking-wider">
                {view.shared.name} — together
              </p>
              <p className="text-ink font-heading tnum mt-1 text-4xl font-bold">
                {formatCents(view.shared.balanceCents)}
              </p>
              <p className="text-muted mt-2 text-sm">
                What you two can spend together right now.
              </p>
            </section>
          )}

          {/* Split confirmation (§3.6) — a shared cost isn't fully agreed until
              everyone has OK'd it. Never blocks: it still reserves and splits
              while pending; this is what's awaiting agreement, not the money. */}
          {view.pendingSplits.length > 0 && (
            <section className="mt-6 space-y-2">
              {view.pendingSplits.map((s) => (
                <div
                  key={s.splitRuleId}
                  className={`rounded-2xl border p-4 ${
                    s.status === "needs_your_ok"
                      ? "border-accent/30 bg-accent/5"
                      : "bg-card border-line"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink text-sm font-bold">{s.name}</p>
                      <p className="text-muted text-xs">
                        {s.proposedByName} proposed{" "}
                        {formatCents(s.amountPerOccurrenceCents)}
                        {s.freq === "monthly" && "/mo"}, {s.splitLabel}
                      </p>
                    </div>
                    <span className="tnum text-ink shrink-0 text-sm font-bold">
                      {formatCents(s.amountPerOccurrenceCents)}
                    </span>
                  </div>
                  {s.status === "needs_your_ok" ? (
                    <form action={agreeToSplitAction} className="mt-3">
                      <input type="hidden" name="splitRuleId" value={s.splitRuleId} />
                      <button
                        type="submit"
                        className="bg-primary rounded-full px-4 py-2 text-xs font-bold text-white"
                      >
                        I agree
                      </button>
                    </form>
                  ) : (
                    <p className="text-muted mt-2 text-xs">
                      Waiting on your partner to confirm.
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Each member's personal Safe-to-Spend */}
          <section className="mt-6 space-y-3">
            <h2 className="font-heading text-ink text-base font-bold">
              Personal
            </h2>
            {view.members.map((m) => (
              <div
                key={m.memberId}
                className="border-line bg-card flex items-center justify-between rounded-2xl border p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-ink text-sm font-bold">
                    {m.displayName}
                    {m.isYou && (
                      <span className="text-muted ml-2 text-xs font-normal">
                        that&apos;s you
                      </span>
                    )}
                  </p>
                  {m.hasCrunch && (
                    <p className="text-alert mt-0.5 text-xs font-bold">
                      Cash gets tight soon
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {m.visible ? (
                    m.isDeficit ? (
                      <span className="text-alert text-sm font-bold">
                        Doesn&apos;t add up
                      </span>
                    ) : (
                      <span className="tnum text-ink font-heading text-xl font-bold">
                        {formatCents(m.dailyCents ?? 0)}
                        <span className="text-muted text-xs font-bold">/day</span>
                      </span>
                    )
                  ) : (
                    <span className="text-muted text-xs font-bold">Private</span>
                  )}
                </div>
              </div>
            ))}
          </section>

          {view.householdHasCrunch && (
            <p className="text-muted mt-4 text-xs leading-5">
              A crunch point is coming up for the household. Nothing&apos;s
              blocked — an advance between you, or moving a one-time expense, can
              smooth it over.
            </p>
          )}

          {/* Propose a shared cost — split equally, needs everyone's OK (§3.6).
              Same one-time/recurring options as a personal Program Spend. */}
          <section className="mt-8">
            <h2 className="font-heading text-ink text-base font-bold">
              Propose a shared cost
            </h2>
            <p className="text-muted mt-1 text-xs leading-5">
              Split equally to start — your partner will need to OK it before
              it&apos;s fully confirmed.
            </p>
            <ProposeSharedCostForm
              startDate={view.horizonStart}
              endDate={view.horizonEnd}
              asOf={view.asOf}
            />
          </section>

          {/* Advances — move liquidity only, never the pool or either daily (E6) */}
          <section className="mt-8">
            <h2 className="font-heading text-ink text-base font-bold">
              Advances
            </h2>
            <p className="text-muted mt-1 text-xs leading-5">
              Covering something for each other while your calendars don&apos;t
              line up. It moves cash, not your Safe-to-Spend.
            </p>

            {view.advances.length > 0 && (
              <ul className="mt-3 space-y-2">
                {view.advances.map((a) => (
                  <li
                    key={a.id}
                    className="bg-card border-line flex items-center justify-between rounded-xl border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-ink text-sm font-bold">
                        {a.direction === "you_gave" ? (
                          <>
                            {a.otherName} owes you {formatCents(a.amountCents)}
                          </>
                        ) : (
                          <>
                            You owe {a.otherName} {formatCents(a.amountCents)}
                          </>
                        )}
                      </p>
                      <p className="text-muted text-xs">
                        {formatShortDate(a.date)}
                        {a.expectedSettleDate &&
                          ` — settles ${formatShortDate(a.expectedSettleDate)}`}
                      </p>
                    </div>
                    <form action={settleAdvanceAction}>
                      <input type="hidden" name="advanceId" value={a.id} />
                      <button
                        type="submit"
                        className="text-primary shrink-0 text-xs font-bold"
                      >
                        Mark settled
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {view.otherMembers.length > 0 && (
              <form
                action={logAdvanceAction}
                className="bg-card border-line mt-3 space-y-3 rounded-2xl border p-4"
              >
                <p className="text-ink/70 text-xs">I&apos;m covering this for</p>
                <select
                  name="toMemberId"
                  className="bg-surface text-ink w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                >
                  {view.otherMembers.map((m) => (
                    <option key={m.memberId} value={m.memberId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="Amount ($)"
                  className="bg-surface text-ink tnum w-full rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
                />
                <div>
                  <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
                    Settles around (optional)
                  </label>
                  <input
                    name="expectedSettleDate"
                    type="date"
                    className="bg-surface text-ink mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="border-primary text-primary flex h-11 w-full items-center justify-center rounded-full border text-sm font-bold active:scale-[0.98]"
                >
                  Log advance
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </main>
  );
}
