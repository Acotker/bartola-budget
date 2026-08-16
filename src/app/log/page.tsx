import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeView } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { LogSpendForm } from "@/components/LogSpendForm";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const view = await getHomeView(userId);
  if (!view) redirect("/onboarding");

  const params = await searchParams;
  const initialProgramId =
    typeof params.program === "string" ? params.program : undefined;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-muted text-[15px]">
          Cancel
        </Link>
        <span className="font-heading text-ink text-base font-semibold">
          Sip
        </span>
        <span className="w-12" />
      </div>
      <LogSpendForm
        planId={view.planId}
        input={view.input}
        asOf={view.asOf}
        programs={view.programs}
        initialProgramId={initialProgramId}
      />
    </main>
  );
}
