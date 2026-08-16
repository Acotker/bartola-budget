import { redirect } from "next/navigation";
import { getHomeView } from "@/lib/data";
import { LogSpendForm } from "@/components/LogSpendForm";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const view = await getHomeView();
  if (!view) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-10">
      <h1 className="font-heading text-ink text-2xl font-semibold">Log a spend</h1>
      <p className="text-ink/50 mt-1 text-sm">Under five seconds. Amount, where it comes from, done.</p>
      <div className="mt-8 flex flex-1 flex-col">
        <LogSpendForm
          planId={view.planId}
          input={view.input}
          asOf={view.asOf}
          programs={view.programs}
        />
      </div>
    </main>
  );
}
