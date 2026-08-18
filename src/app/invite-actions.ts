"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

// Partner invitation (spec §8.2): one person sets up, the other reviews. An
// Invite is a share link into an existing household. Accepting it creates a
// bare Member + Plan for the invitee (their own obligations container) and
// sends them to the abbreviated intake — they never repeat household setup.

/** Create (or reuse) an unused invite link for the current user's household. */
export async function createInviteAction(): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const member = await prisma.member.findFirst({ where: { userId } });
  if (!member) redirect("/onboarding"); // set up your own plan first

  let invite = await prisma.invite.findFirst({
    where: { householdId: member.householdId, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!invite) {
    invite = await prisma.invite.create({
      data: { householdId: member.householdId, token: crypto.randomUUID() },
    });
  }

  redirect(`/household?invite=${invite.token}`);
}

/** Accept an invite: join the household with a bare plan, then go fill in your
 *  own assets/tranches/obligations/buffer. */
export async function acceptInviteAction(formData: FormData): Promise<void> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const token = String(formData.get("token") ?? "");
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.usedAt) redirect(`/join/${token}?error=invalid`);

  const household = await prisma.household.findUnique({
    where: { id: invite.householdId },
  });
  if (!household) redirect(`/join/${token}?error=invalid`);

  const existingMember = await prisma.member.findFirst({ where: { userId } });
  if (existingMember) redirect("/household"); // already set up somewhere

  const existingPlan = await prisma.plan.findFirst({ where: { userId } });
  if (existingPlan) redirect(`/join/${token}?error=has_plan`);

  await prisma.plan.create({
    data: {
      userId,
      poolAmountCents: 0,
      startDate: household.horizonStart,
      endDate: household.horizonEnd,
    },
  });
  await prisma.member.create({
    data: {
      householdId: household.id,
      userId,
      displayName: "",
      role: "partner",
      bufferCents: 0,
    },
  });
  await prisma.invite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  redirect("/onboarding/partner");
}
