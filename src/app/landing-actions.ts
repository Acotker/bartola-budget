"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/** The landing page's quiet email fallback (spec §4 Final CTA). No account, no session. */
export async function emailSignupAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (email.includes("@")) {
    await prisma.emailSignup.create({ data: { email, source: "landing_final_cta" } });
  }
  redirect("/?subscribed=1");
}
