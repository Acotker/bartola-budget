"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { APP_ASOF } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { addDays } from "@/engine";

function isoOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

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

  // Backdating (§ Log a spend): only today or one of the last two days, and
  // never before the plan started. Anything else falls back to today.
  const requestedDate = isoOrNull(formData.get("date"));
  const backdateFloor = addDays(APP_ASOF, -2);
  const date =
    requestedDate &&
    requestedDate <= APP_ASOF &&
    requestedDate >= backdateFloor &&
    requestedDate >= plan.startDate
      ? requestedDate
      : APP_ASOF;

  const amountCents = Math.round(rawAmount * 100);
  await prisma.spendEntry.create({
    data: { planId, date, amountCents, type, programSpendId, note },
  });

  revalidatePath("/");
  redirect(`/?sipped=${amountCents}&kind=${type}`);
}

/** Correct a logged spend (explicit user correction — history is otherwise never rewritten). */
export async function editSpendAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const id = String(formData.get("entryId") ?? "");
  const entry = await prisma.spendEntry.findFirst({
    where: { id, plan: { userId } },
  });
  if (!entry) redirect("/");

  const rawAmount = Number(formData.get("amount"));
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    redirect(`/spend/${id}?error=amount`);
  }
  const note = String(formData.get("note") ?? "").trim() || null;

  await prisma.spendEntry.update({
    where: { id },
    data: { amountCents: Math.round(rawAmount * 100), note },
  });

  revalidatePath("/");
  redirect("/");
}

export async function deleteSpendAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const id = String(formData.get("entryId") ?? "");
  const entry = await prisma.spendEntry.findFirst({
    where: { id, plan: { userId } },
  });
  if (!entry) redirect("/");

  await prisma.spendEntry.delete({ where: { id } });

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

  redirect("/?welcome=1");
}

/** Create a Program Spend (Epic 3). addedOn = today so the recalc takes effect tomorrow. */
export async function createProgramAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const planId = String(formData.get("planId") ?? "");
  const plan = await prisma.plan.findFirst({ where: { id: planId, userId } });
  if (!plan) redirect("/programs");

  const name = String(formData.get("name") ?? "").trim() || "Program Spend";
  const rawAmount = Number(formData.get("amount"));
  const kind = String(formData.get("kind") ?? "monthly");
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    redirect("/programs/new?error=amount");
  }
  const amountPerOccurrenceCents = Math.round(rawAmount * 100);
  const startDate = isoOrNull(formData.get("startDate"));
  const endDate = isoOrNull(formData.get("endDate"));

  if (kind === "onetime") {
    const targetDate = isoOrNull(formData.get("targetDate"));
    if (!targetDate) redirect("/programs/new?error=date");
    await prisma.programSpend.create({
      data: { planId, name, isRecurring: false, amountPerOccurrenceCents, targetDate, addedOn: APP_ASOF },
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
    await prisma.programSpend.create({
      data: {
        planId,
        name,
        isRecurring: true,
        freq,
        anchorDay,
        anchorWeekday,
        amountPerOccurrenceCents,
        startDate,
        endDate,
        addedOn: APP_ASOF,
      },
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

  // End from a chosen date forward (default tomorrow). The engine keeps
  // occurrences before this date, so history is preserved.
  const fromDate = isoOrNull(formData.get("fromDate")) ?? addDays(APP_ASOF, 1);

  await prisma.programSpend.update({
    where: { id },
    data: { status: "cancelled", cancelledOn: fromDate },
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
  const amountPerOccurrenceCents = Math.round(rawAmount * 100);
  const boundary = addDays(APP_ASOF, 1); // edits take effect tomorrow
  const groupId = prog.groupId ?? prog.id;

  if (!prog.isRecurring) {
    // One-time: editable only while it hasn't happened yet (never rewrite history).
    if (prog.targetDate && prog.targetDate < boundary) redirect(`/programs/${id}`);
    const targetDate = isoOrNull(formData.get("targetDate")) ?? prog.targetDate;
    await prisma.programSpend.update({
      where: { id },
      data: { name, amountPerOccurrenceCents, targetDate, addedOn: APP_ASOF },
    });
    revalidatePath("/");
    revalidatePath("/programs");
    redirect(`/programs/${id}`);
  }

  // Recurring: effective-dated. Truncate the current record at tomorrow and
  // create a linked successor carrying the new rule from tomorrow onward. Past
  // occurrences (and anything logged) stay exactly as they were.
  const kind = String(formData.get("kind") ?? prog.freq ?? "monthly");
  const freq = ["daily", "weekly", "biweekly", "monthly"].includes(kind)
    ? kind
    : "monthly";
  const anchorDay =
    freq === "monthly" ? Number(formData.get("anchorDay")) || prog.anchorDay || 1 : null;
  const anchorWeekday =
    freq === "weekly" || freq === "biweekly"
      ? Number(formData.get("anchorWeekday")) || prog.anchorWeekday || 1
      : null;
  const originalEnd = prog.endDate;
  const submittedEnd = isoOrNull(formData.get("endDate"));

  await prisma.programSpend.update({
    where: { id },
    data: { status: "superseded", endDate: boundary, groupId },
  });
  await prisma.programSpend.create({
    data: {
      planId: prog.planId,
      name,
      isRecurring: true,
      freq,
      anchorDay,
      anchorWeekday,
      amountPerOccurrenceCents,
      startDate: boundary,
      endDate: submittedEnd ?? originalEnd,
      addedOn: APP_ASOF,
      groupId,
      status: "active",
    },
  });

  revalidatePath("/");
  revalidatePath("/programs");
  redirect(`/programs`);
}
