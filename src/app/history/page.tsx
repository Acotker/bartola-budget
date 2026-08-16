import Link from "next/link";
import { redirect } from "next/navigation";
import { getHistory } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { formatCents, formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const view = await getHistory(userId);
  if (!view) redirect("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-10">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-ink text-2xl font-semibold">Activity</h1>
        <Link href="/" className="text-ink/50 text-sm font-bold">
          Done
        </Link>
      </div>

      {view.entries.length === 0 ? (
        <p className="text-ink/50 mt-6 text-sm">No spending logged yet.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {view.entries.map((e) => (
            <li
              key={e.id}
              className="bg-card flex items-center justify-between rounded-xl px-4 py-3 shadow-sm"
            >
              <div>
                <p className="text-ink text-sm font-bold">
                  {e.note ?? e.label}
                </p>
                <p className="text-ink/50 text-xs">
                  {formatShortDate(e.date)} ·{" "}
                  <span
                    className={
                      e.type === "program" ? "text-accent" : "text-ink/50"
                    }
                  >
                    {e.label}
                  </span>
                </p>
              </div>
              <span className="tnum text-ink text-sm font-bold">
                {formatCents(e.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
