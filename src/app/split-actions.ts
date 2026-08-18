"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { APP_ASOF } from "@/lib/data";

// Shared costs and their splits (§3.6). A new shared cost is proposed by one
// member -- their agreement is recorded immediately -- and needs every other
// household member to explicitly agree before it's fully confirmed. This is an
// awareness layer, not a gate: the obligation reserves and splits normally
// while pending, consistent with the product's "never blocks" rule. Only
// renegotiating an EXISTING agreed split (clearing agreedBy and re-proposing)
// is out of scope here -- this covers first-time proposals only.

const isoOrNull = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** Propose a new shared cost, split equally, needing everyone's OK. Same
 *  recurrence options as a personal Program Spend (createProgramAction):
 *  one-time or daily/weekly/biweekly/monthly, with a day/date and, for
 *  recurring costs, a start/end window. */
export async function proposeSharedCostAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const me = await prisma.member.findFirst({ where: { userId } });
  const plan = await prisma.plan.findFirst({ where: { userId } });
  if (!me || !plan) redirect("/household");

  const name = String(formData.get("name") ?? "").trim();
  const rawAmount = Number(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "monthly");
  if (!name || !Number.isFinite(rawAmount) || rawAmount <= 0) {
    redirect("/household?error=split");
  }
  const amountPerOccurrenceCents = Math.round(rawAmount * 100);

  const rule = await prisma.splitRule.create({
    data: {
      type: "equal",
      config: {},
      agreedBy: { [me.id]: new Date().toISOString() },
    },
  });

  if (kind === "onetime") {
    const targetDate = isoOrNull(formData.get("targetDate"));
    if (!targetDate) redirect("/household?error=split_date");
    await prisma.programSpend.create({
      data: {
        planId: plan.id,
        name,
        isRecurring: false,
        amountPerOccurrenceCents,
        targetDate,
        addedOn: APP_ASOF,
        scope: "shared",
        kind: "standard",
        splitRuleId: rule.id,
      },
    });
  } else {
    const freq = ["daily", "weekly", "biweekly", "monthly"].includes(kind)
      ? kind
      : "monthly";
    const anchorDay =
      freq === "monthly" ? Number(formData.get("anchorDay")) || 1 : null;
    const anchorWeekday =
      freq === "weekly" || freq === "biweekly"
        ? Number(formData.get("anchorWeekday")) || 1
        : null;
    const startDate = isoOrNull(formData.get("startDate"));
    const endDate = isoOrNull(formData.get("endDate"));
    await prisma.programSpend.create({
      data: {
        planId: plan.id,
        name,
        isRecurring: true,
        freq,
        anchorDay,
        anchorWeekday,
        amountPerOccurrenceCents,
        startDate,
        endDate,
        addedOn: APP_ASOF,
        scope: "shared",
        kind: "standard",
        splitRuleId: rule.id,
      },
    });
  }

  revalidatePath("/household");
  redirect("/household");
}

/** Add the current member's agreement to a proposed split. */
export async function agreeToSplitAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const me = await prisma.member.findFirst({ where: { userId } });
  if (!me) redirect("/household");

  const splitRuleId = String(formData.get("splitRuleId") ?? "");
  const rule = await prisma.splitRule.findUnique({
    where: { id: splitRuleId },
    include: { obligations: { include: { plan: { include: { user: true } } } } },
  });
  if (!rule) redirect("/household");

  // Only a member of the same household as this rule's obligations may agree.
  const ownerUserIds = rule.obligations.map((o) => o.plan.userId);
  const ownerMembers = ownerUserIds.length
    ? await prisma.member.findMany({ where: { userId: { in: ownerUserIds } } })
    : [];
  const sameHousehold = ownerMembers.some((m) => m.householdId === me.householdId);
  if (!sameHousehold) redirect("/household");

  const agreedBy = (rule.agreedBy as Record<string, string> | null) ?? {};
  agreedBy[me.id] = new Date().toISOString();
  await prisma.splitRule.update({
    where: { id: rule.id },
    data: { agreedBy },
  });

  revalidatePath("/household");
  redirect("/household");
}
