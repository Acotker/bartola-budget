import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getImportReview } from "@/lib/import-data";
import { ImportReviewList } from "@/components/ImportReviewList";

export const dynamic = "force-dynamic";

export default async function ImportReviewPage({
  params,
}: {
  params: Promise<{ uploadId: string }>;
}) {
  const { uploadId } = await params;
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const view = await getImportReview(userId, uploadId);
  if (!view) redirect("/import");

  const pending = view.candidates.filter((c) => c.status === "pending");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pt-12">
      <div className="flex items-center justify-between">
        <Link href="/import" className="text-muted text-[15px]">
          Back
        </Link>
        <span className="font-heading text-ink text-base font-semibold">
          What we found
        </span>
        <span className="w-10" />
      </div>

      <p className="text-muted mt-6 text-sm leading-6">
        {view.rowCount.toLocaleString()} rows read
        {view.skippedRowCount > 0
          ? ` · ${view.skippedRowCount.toLocaleString()} skipped (we couldn't read the date or amount)`
          : ""}
        . Checked items become Program Spends — untick anything you don&apos;t
        want.
      </p>

      <ImportReviewList
        uploadId={view.uploadId}
        input={view.input}
        asOf={view.asOf}
        planEndDate={view.planEndDate}
        candidates={pending}
      />
    </main>
  );
}
