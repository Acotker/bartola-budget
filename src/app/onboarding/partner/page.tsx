import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PartnerIntakeWizard } from "@/components/PartnerIntakeWizard";

export const dynamic = "force-dynamic";

export default async function PartnerOnboardingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const member = await prisma.member.findFirst({ where: { userId } });
  if (!member) redirect("/onboarding"); // no invite accepted — normal solo flow

  const household = await prisma.household.findUnique({
    where: { id: member.householdId },
  });
  if (!household) redirect("/onboarding");

  return (
    <main className="flex w-full flex-1 flex-col">
      <PartnerIntakeWizard
        startDate={household.horizonStart}
        endDate={household.horizonEnd}
      />
    </main>
  );
}
