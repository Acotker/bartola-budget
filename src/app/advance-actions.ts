"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { APP_ASOF } from "@/lib/data";

// Advances move liquidity, never the pool or either member's daily (E6, §3.7) —
// covering a partner's rent because your loan lands later, settled when it does.

const isoOrNull = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** Log an advance FROM the current user TO another member of their household —
 *  "I'm covering this for them." */
export async function logAdvanceAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const me = await prisma.member.findFirst({ where: { userId } });
  if (!me) redirect("/household");

  const toMemberId = String(formData.get("toMemberId") ?? "");
  const rawAmount = Number(formData.get("amount"));
  const expectedSettleDate = isoOrNull(formData.get("expectedSettleDate"));

  if (!Number.isFinite(rawAmount) || rawAmount <= 0) redirect("/household?error=advance");

  // Only within the same household — no cross-household transfers.
  const to = await prisma.member.findFirst({
    where: { id: toMemberId, householdId: me.householdId },
  });
  if (!to) redirect("/household?error=advance");

  await prisma.advance.create({
    data: {
      fromMemberId: me.id,
      toMemberId: to.id,
      amountCents: Math.round(rawAmount * 100),
      date: APP_ASOF,
      expectedSettleDate,
      status: "open",
    },
  });

  revalidatePath("/household");
  redirect("/household");
}

/** Mark an advance settled — either side of it can confirm. */
export async function settleAdvanceAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const me = await prisma.member.findFirst({ where: { userId } });
  if (!me) redirect("/household");

  const id = String(formData.get("advanceId") ?? "");
  const advance = await prisma.advance.findFirst({
    where: { id, OR: [{ fromMemberId: me.id }, { toMemberId: me.id }] },
  });
  if (!advance) redirect("/household");

  await prisma.advance.update({ where: { id }, data: { status: "settled" } });

  revalidatePath("/household");
  redirect("/household");
}
