"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import type { PartnerIntakePayload } from "@/lib/intake-types";

// Fills in the bare Member + Plan created at invite-accept time with the
// partner's own assets, tranches, obligations, and buffer (§8.2). Never touches
// the household's horizon or the other member's holdings.

const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export async function completePartnerIntake(
  payload: PartnerIntakePayload,
): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const member = await prisma.member.findFirst({
    where: { userId },
    include: { assets: true, tranches: true },
  });
  const plan = await prisma.plan.findFirst({ where: { userId } });
  if (!member || !plan) redirect("/household");

  // Idempotency: if this member already has holdings, the wizard already ran —
  // don't duplicate on a resubmit.
  if (member.assets.length > 0 || member.tranches.length > 0) {
    redirect("/household");
  }

  await prisma.member.update({
    where: { id: member.id },
    data: {
      displayName: payload.displayName.trim(),
      bufferCents: nonNeg(payload.bufferCents),
    },
  });

  for (const a of payload.assets.filter(
    (a) => a.label.trim() && a.balanceCents > 0,
  )) {
    await prisma.asset.create({
      data: {
        memberId: member.id,
        label: a.label.trim(),
        balanceCents: nonNeg(a.balanceCents),
        spendable: a.spendable,
        asOf: plan.startDate,
      },
    });
  }

  for (const t of payload.tranches.filter(
    (t) => t.grossCents > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.expectedDate),
  )) {
    await prisma.inflowTranche.create({
      data: {
        memberId: member.id,
        label: t.label.trim() || "Incoming money",
        kind: t.kind,
        grossCents: nonNeg(t.grossCents),
        feesCents: nonNeg(t.feesCents),
        passthroughCents: nonNeg(t.passthroughCents),
        expectedDate: t.expectedDate,
        certainty: t.certainty,
        status: "pending",
      },
    });
  }

  for (const o of payload.obligations) {
    if (!o.name.trim() || o.amountPerOccurrenceCents <= 0) continue;
    await prisma.programSpend.create({
      data: {
        planId: plan.id,
        name: o.name.trim(),
        isRecurring: o.isRecurring,
        freq: o.isRecurring ? o.freq ?? "monthly" : null,
        anchorDay:
          o.isRecurring && (o.freq ?? "monthly") === "monthly" ? o.anchorDay ?? 1 : null,
        amountPerOccurrenceCents: nonNeg(o.amountPerOccurrenceCents),
        targetDate: !o.isRecurring ? o.targetDate ?? null : null,
        scope: "personal",
        ownerMemberId: member.id,
      },
    });
  }

  redirect("/household?welcome=1");
}
