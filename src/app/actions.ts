"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { APP_ASOF } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";

/**
 * Log a real spend. A Server Action is a public POST endpoint, so it verifies
 * the session and that the plan belongs to the caller before writing.
 */
export async function logSpendAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const planId = String(formData.get("planId") ?? "");
  const rawAmount = Number(formData.get("amount"));
  const type =
    String(formData.get("type") ?? "s2s") === "program" ? "program" : "s2s";
  const programSpendId =
    type === "program" ? String(formData.get("programSpendId") ?? "") || null : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!planId || !Number.isFinite(rawAmount) || rawAmount <= 0) return;
  if (type === "program" && !programSpendId) return;

  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) redirect("/");

  const amountCents = Math.round(rawAmount * 100);
  await prisma.spendEntry.create({
    data: { planId, date: APP_ASOF, amountCents, type, programSpendId, note },
  });

  revalidatePath("/");
  redirect("/");
}

/** Create the user's plan during onboarding (Epic 1). */
export async function createPlanAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const rawPool = Number(formData.get("pool"));
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");

  const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (
    !Number.isFinite(rawPool) ||
    rawPool <= 0 ||
    !validDate(startDate) ||
    !validDate(endDate) ||
    endDate <= startDate
  ) {
    redirect("/onboarding?error=invalid");
  }

  await prisma.plan.create({
    data: {
      userId,
      poolAmountCents: Math.round(rawPool * 100),
      startDate,
      endDate,
    },
  });

  redirect("/");
}

/** Create a Program Spend (Epic 3). addedOn = today so the recalc takes effect tomorrow. */
export async function createProgramAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const planId = String(formData.get("planId") ?? "");
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) redirect("/programs");

  const name = String(formData.get("name") ?? "").trim() || "Budget";
  const rawAmount = Number(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "recurring");
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    redirect("/programs/new?error=amount");
  }
  const amountPerOccurrenceCents = Math.round(rawAmount * 100);

  if (kind === "onetime") {
    const targetDate = String(formData.get("targetDate") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      redirect("/programs/new?error=date");
    }
    await prisma.programSpend.create({
      data: { planId, name, isRecurring: false, amountPerOccurrenceCents, targetDate, addedOn: APP_ASOF },
    });
  } else {
    const freq = String(formData.get("freq") ?? "monthly");
    const anchorDay =
      freq === "monthly" ? Number(formData.get("anchorDay")) || 1 : null;
    await prisma.programSpend.create({
      data: { planId, name, isRecurring: true, freq, anchorDay, amountPerOccurrenceCents, addedOn: APP_ASOF },
    });
  }

  revalidatePath("/");
  revalidatePath("/programs");
  redirect("/programs");
}

/** Cancel a Program Spend, freeing its future reservations. */
export async function cancelProgramAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const id = String(formData.get("programId") ?? "");
  const prog = await prisma.programSpend.findFirst({
    where: { id, plan: { userId } },
  });
  if (!prog) redirect("/programs");

  await prisma.programSpend.update({
    where: { id },
    data: { status: "cancelled", cancelledOn: APP_ASOF },
  });

  revalidatePath("/");
  revalidatePath("/programs");
  redirect("/programs");
}

const isISODate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Edit the plan's pool amount and/or dates (Epic 2). Triggers recalc on read. */
export async function updatePlanAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const planId = String(formData.get("planId") ?? "");
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) redirect("/settings");

  const rawPool = Number(formData.get("pool"));
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (
    !Number.isFinite(rawPool) ||
    rawPool <= 0 ||
    !isISODate(startDate) ||
    !isISODate(endDate) ||
    endDate <= startDate
  ) {
    redirect("/settings?error=invalid");
  }

  await prisma.plan.update({
    where: { id: planId },
    data: { poolAmountCents: Math.round(rawPool * 100), startDate, endDate },
  });

  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings");
}

/** Log additional income/loan/gift that increases the pool (Epic 2). */
export async function addInflowAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const planId = String(formData.get("planId") ?? "");
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) redirect("/settings");

  const rawAmount = Number(formData.get("amount"));
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) redirect("/settings?error=amount");
  const note = String(formData.get("note") ?? "").trim() || null;

  await prisma.planAdjustment.create({
    data: {
      planId,
      type: "income_add",
      amountCents: Math.round(rawAmount * 100),
      date: APP_ASOF,
      note,
    },
  });

  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings");
}

/** Edit a Program Spend's name/amount (Epic 3). Amount changes recalc from today. */
export async function editProgramAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const id = String(formData.get("programId") ?? "");
  const prog = await prisma.programSpend.findFirst({
    where: { id, plan: { userId } },
  });
  if (!prog) redirect("/programs");

  const name = String(formData.get("name") ?? "").trim() || prog.name;
  const rawAmount = Number(formData.get("amount"));
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    redirect(`/programs/${id}?error=amount`);
  }

  await prisma.programSpend.update({
    where: { id },
    data: {
      name,
      amountPerOccurrenceCents: Math.round(rawAmount * 100),
      // An edit takes effect from today onward.
      addedOn: APP_ASOF,
    },
  });

  revalidatePath("/");
  revalidatePath("/programs");
  redirect(`/programs/${id}`);
}
