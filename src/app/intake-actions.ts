"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import type { IntakePayload } from "@/lib/intake-types";

// The financial-intake wizard persists everything in one shot (spec Part 5). The
// wizard is progressive — only the horizon and a starting balance are required;
// assets, tranches, and obligations are invited. Net-of-fees/passthrough is
// derived by the engine, so tranches store gross/fees/passthrough as entered.

const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export async function createIntake(payload: IntakePayload): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  // One plan per user in v1 — don't let a re-submit create a duplicate.
  const existing = await prisma.plan.findFirst({ where: { userId } });
  if (existing) redirect("/");

  const { startDate, endDate } = payload;
  if (!validDate(startDate) || !validDate(endDate) || endDate <= startDate) {
    redirect("/onboarding?error=dates");
  }

  // The composed pool comes from assets + tranches, so the legacy scalar is 0.
  const plan = await prisma.plan.create({
    data: { userId, poolAmountCents: 0, startDate, endDate },
  });

  const household = await prisma.household.create({
    data: {
      horizonStart: startDate,
      horizonEnd: endDate,
      members: {
        create: {
          userId,
          displayName: payload.displayName.trim(),
          role: "owner",
          bufferCents: nonNeg(payload.bufferCents),
          assets: {
            create: payload.assets
              .filter((a) => a.label.trim() !== "")
              .map((a) => ({
                label: a.label.trim(),
                balanceCents: nonNeg(a.balanceCents),
                spendable: a.spendable,
                asOf: startDate,
              })),
          },
          tranches: {
            create: payload.tranches
              .filter((t) => t.grossCents > 0 && validDate(t.expectedDate))
              .map((t) => ({
                label: t.label.trim() || "Incoming money",
                kind: t.kind,
                grossCents: nonNeg(t.grossCents),
                feesCents: nonNeg(t.feesCents),
                passthroughCents: nonNeg(t.passthroughCents),
                expectedDate: t.expectedDate,
                certainty: t.certainty,
                status: "pending",
              })),
          },
        },
      },
    },
    include: { members: true },
  });

  const memberId = household.members[0].id;

  for (const o of payload.obligations) {
    if (!o.name.trim() || o.amountPerOccurrenceCents <= 0) continue;
    await prisma.programSpend.create({
      data: {
        planId: plan.id,
        name: o.name.trim(),
        isRecurring: o.isRecurring,
        freq: o.isRecurring ? o.freq ?? "monthly" : null,
        anchorDay: o.isRecurring && (o.freq ?? "monthly") === "monthly" ? o.anchorDay ?? 1 : null,
        amountPerOccurrenceCents: nonNeg(o.amountPerOccurrenceCents),
        targetDate: !o.isRecurring ? o.targetDate ?? null : null,
        scope: "personal",
        ownerMemberId: memberId,
      },
    });
  }

  redirect("/?welcome=1");
}
