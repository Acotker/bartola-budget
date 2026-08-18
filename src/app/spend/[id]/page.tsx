import Link from "next/link";
import { redirect } from "next/navigation";
import { getSpendEntry } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { editSpendAction, deleteSpendAction } from "@/app/actions";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditSpendPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const entry = await getSpendEntry(userId, id);
  if (!entry) redirect("/home");

  const source =
    entry.type === "program"
      ? (entry.programName ?? "Program Spend")
      : "Safe to Spend";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-12">
      <div className="flex items-center justify-between">
        <Link href="/home" className="text-muted text-[15px]">
          Cancel
        </Link>
        <span className="font-heading text-ink text-base font-semibold">
          Edit sip
        </span>
        <span className="w-12" />
      </div>

      <p className="text-muted mt-6 text-sm">
        {source} · {formatShortDate(entry.date)}
      </p>

      <form action={editSpendAction} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="entryId" value={entry.id} />
        <div className="flex flex-col gap-1">
          <label className="text-muted text-xs font-bold uppercase tracking-wider">
            Amount ($)
          </label>
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={(entry.amountCents / 100).toString()}
            className="bg-card text-ink border-line tnum rounded-xl border px-4 py-3 text-lg font-bold outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted text-xs font-bold uppercase tracking-wider">
            Note
          </label>
          <input
            name="note"
            defaultValue={entry.note ?? ""}
            placeholder="Optional"
            className="bg-card text-ink border-line placeholder:text-muted/60 rounded-xl border px-4 py-3 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          className="bg-primary font-heading mt-2 flex h-12 items-center justify-center rounded-full text-sm font-semibold text-white shadow active:scale-[0.98]"
        >
          Save changes
        </button>
      </form>

      <form action={deleteSpendAction} className="mt-4">
        <input type="hidden" name="entryId" value={entry.id} />
        <button className="text-alert flex h-11 w-full items-center justify-center text-sm font-bold">
          Delete this sip
        </button>
      </form>
    </main>
  );
}
