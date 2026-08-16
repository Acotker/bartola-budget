import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { createPlanAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <h1 className="font-heading text-ink text-2xl font-semibold">
        Set up your plan
      </h1>
      <p className="text-ink/60 mt-1 text-sm">
        Three things: how much money you have, and the window it needs to last.
      </p>

      <form action={createPlanAction} className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            Total pool ($)
          </label>
          <input
            name="pool"
            inputMode="decimal"
            required
            placeholder="60000"
            className="bg-card text-ink placeholder:text-ink/30 tnum rounded-xl px-4 py-3 text-lg font-bold shadow-sm outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            Start date
          </label>
          <input
            name="startDate"
            type="date"
            required
            defaultValue="2026-09-01"
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            End date
          </label>
          <input
            name="endDate"
            type="date"
            required
            defaultValue="2027-08-31"
            className="bg-card text-ink rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
        </div>

        <button
          type="submit"
          className="bg-primary mt-4 flex h-14 items-center justify-center rounded-full text-base font-bold text-white shadow-lg active:scale-[0.98]"
        >
          See my daily sip
        </button>
      </form>
    </main>
  );
}
