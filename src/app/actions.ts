"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { APP_ASOF } from "@/lib/data";

/**
 * Log a real spend. A Server Action is a public POST endpoint, so it validates
 * its own input. Recalculation is derived on read by the engine, so we only
 * persist the entry here.
 */
export async function logSpendAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const rawAmount = Number(formData.get("amount"));
  const type = String(formData.get("type") ?? "s2s") === "program" ? "program" : "s2s";
  const programSpendId =
    type === "program" ? String(formData.get("programSpendId") ?? "") || null : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!planId || !Number.isFinite(rawAmount) || rawAmount <= 0) return;
  if (type === "program" && !programSpendId) return;

  const amountCents = Math.round(rawAmount * 100);

  await prisma.spendEntry.create({
    data: { planId, date: APP_ASOF, amountCents, type, programSpendId, note },
  });

  revalidatePath("/");
  redirect("/");
}
