import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getHouseholdView } from "@/lib/data";
import { formatCents } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HouseholdPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const view = await getHouseholdView(userId);

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

      {!view ? (
        <section className="mt-8">
          <h1 className="font-heading text-ink text-2xl font-bold">
            You&apos;re flying solo
          </h1>
          <p className="text-ink/70 mt-2 text-sm leading-6">
            Sip works for two. Share rent, groceries, and travel, keep your own
            number, and see one shared Safe-to-Spend for the things you do
            together. Partner invites are coming soon.
          </p>
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
        </>
      )}
    </main>
  );
}
