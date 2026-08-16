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
