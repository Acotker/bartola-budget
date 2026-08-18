"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";

export function FinalCtaLink({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/login"
      onClick={() => track("onboarding_started", { source: "final_cta" })}
      className="bg-primary font-heading flex h-14 w-full items-center justify-center rounded-full text-base font-semibold text-white shadow-lg active:scale-[0.98]"
    >
      {children}
    </Link>
  );
}
