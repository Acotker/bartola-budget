import { redirect } from "next/navigation";
import { getHomeView } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { AddProgramForm } from "@/components/AddProgramForm";

export const dynamic = "force-dynamic";

export default async function NewProgramPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const view = await getHomeView(userId);
  if (!view) redirect("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-10">
      <h1 className="font-heading text-ink text-2xl font-semibold">New budget</h1>
      <p className="text-ink/50 mt-1 text-sm">
        Set money aside. You&apos;ll see exactly what it costs your daily number.
      </p>
      <div className="mt-8 flex flex-1 flex-col">
        <AddProgramForm planId={view.planId} input={view.input} asOf={view.asOf} />
      </div>
    </main>
  );
}
