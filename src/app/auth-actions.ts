"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

// Only ever honor a "next" destination inside our own /join/<token> flow — an
// open redirect elsewhere would let a crafted link bounce a session anywhere.
function safeNext(formData: FormData): string | null {
  const next = String(formData.get("next") ?? "");
  return /^\/join\/[A-Za-z0-9-]+$/.test(next) ? next : null;
}

export async function signupAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData);
  if (!email.includes("@") || password.length < 6) {
    redirect(next ? `/login?error=invalid&next=${next}` : "/login?error=invalid");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) redirect(next ? `/login?error=exists&next=${next}` : "/login?error=exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, passwordHash } });
  await createSession(user.id);
  redirect(next ?? "/onboarding");
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData);

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) redirect(next ? `/login?error=bad&next=${next}` : "/login?error=bad");

  await createSession(user.id);
  redirect(next ?? "/");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
