import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { loadActivePlan } from "@/lib/data";
import { ImportUploadForm } from "@/components/ImportUploadForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const plan = await loadActivePlan(userId);
  if (!plan) redirect("/onboarding");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 pt-12">
      <div className="flex items-center justify-between">
        <Link href="/programs" className="text-muted text-[15px]">
          Back
        </Link>
        <span className="font-heading text-ink text-base font-semibold">
          Import from a statement
        </span>
        <span className="w-10" />
      </div>

      <h1 className="font-heading text-ink mt-8 text-2xl font-semibold">
        Save yourself the typing
      </h1>
      <p className="text-muted mt-2 text-sm leading-6">
        Upload one statement export and we&apos;ll look for things that repeat —
        rent, subscriptions, the weekly shop. A few months of history works
        better than one. Nothing gets added until you say so.
      </p>

      <ImportUploadForm />
    </main>
  );
}
