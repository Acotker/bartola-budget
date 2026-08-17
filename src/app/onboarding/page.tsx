import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { IntakeWizard } from "@/components/IntakeWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  return (
    <main className="flex w-full flex-1 flex-col">
      <IntakeWizard defaultStart="2026-09-01" defaultEnd="2027-10-26" />
    </main>
  );
}
