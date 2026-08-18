// One-time backfill: create the composed-pool rows (Household, Member, Asset,
// InflowTranche) for plans that predate the financial-intake model, and mark
// their obligations personal. Idempotent — skips any user that already has a
// member — so it doubles as a safe re-run. Uses the pure `migratePlan` mapping,
// which runs the 🔴 B1 guard (assertPoolInvariant) on every plan.
//
// Run locally:  npx tsx prisma/backfill.ts
// Never run against the shared Neon DB directly — schema/data changes there go
// through the owner's pipeline.

import { migratePlan, type LegacyPlan } from "../engine";
import { prisma } from "./db";

export interface BackfillResult {
  userId: string;
  created: boolean;
  memberId?: string;
  reason?: string;
}

export async function backfillUser(userId: string): Promise<BackfillResult> {
  const existing = await prisma.member.findFirst({ where: { userId } });
  if (existing) {
    return { userId, created: false, memberId: existing.id, reason: "already migrated" };
  }

  const plan = await prisma.plan.findFirst({
    where: { userId },
    include: { adjustments: true },
    orderBy: { createdAt: "desc" },
  });
  if (!plan) return { userId, created: false, reason: "no plan" };

  const legacy: LegacyPlan = {
    poolAmountCents: plan.poolAmountCents,
    startDate: plan.startDate,
    endDate: plan.endDate,
    incomes: plan.adjustments
      .filter((a) => a.type === "income_add")
      .map((a) => ({ amountCents: a.amountCents, date: a.date })),
    programs: [], // not needed to build the household rows
  };

  // migratePlan runs assertPoolInvariant — throws before any write if income
  // would be double-counted.
  const m = migratePlan(legacy);

  const household = await prisma.household.create({
    data: {
      horizonStart: m.household.horizonStart,
      horizonEnd: m.household.horizonEnd,
      timezone: m.household.timezone,
      privacyMode: m.household.privacyMode,
      members: {
        create: {
          userId,
          // Empty, not "You" — that's a view-layer label for the viewer's own
          // row, and would otherwise show literally as "You" to a partner.
          displayName: "",
          role: m.member.role,
          bufferCents: m.member.bufferCents,
          assets: {
            create: [
              {
                label: m.asset.label,
                balanceCents: m.asset.balanceCents,
                spendable: m.asset.spendable,
                asOf: m.asset.asOf,
              },
            ],
          },
          tranches: {
            create: m.tranches.map((t) => ({
              label: t.label,
              kind: t.kind,
              grossCents: t.grossCents,
              feesCents: t.feesCents,
              passthroughCents: t.passthroughCents,
              expectedDate: t.expectedDate,
              certainty: t.certainty,
              status: t.status,
              actualCents: t.actualCents,
              actualDate: t.actualDate,
            })),
          },
        },
      },
    },
    include: { members: true },
  });

  const memberId = household.members[0].id;
  await prisma.programSpend.updateMany({
    where: { planId: plan.id },
    data: { scope: "personal", ownerMemberId: memberId },
  });

  return { userId, created: true, memberId };
}

export async function backfillAll(): Promise<BackfillResult[]> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results: BackfillResult[] = [];
  for (const u of users) {
    results.push(await backfillUser(u.id));
  }
  return results;
}
