"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LANDING_DEMO_DINNER_CENTS,
  landingDemoSafeToSpendCents,
} from "@/engine/fixtures/landing-demo";
import { S2SNumber } from "./S2SNumber";
import { FillBar } from "./FillBar";
import { track } from "@/lib/analytics";
import { landing } from "@/content/landing";

const ANIMATION_MS = 600;

// The daily grant is the fill bar's denominator — how much of "today" is
// left. Computed once from the real engine against the demo fixture.
const DAILY_SIP_CENTS = landingDemoSafeToSpendCents();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The only interactive element on the landing page (spec §5). Tapping "Log
 * $45 dinner" recomputes Safe-to-spend via the real engine against a fixed
 * fixture, animates the numeral and fill bar down together, then reveals the
 * highest-intent CTA on the page in the same tick the animation settles.
 */
export function LandingDemo() {
  const [spent, setSpent] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const balanceCents = landingDemoSafeToSpendCents(spent ? LANDING_DEMO_DINNER_CENTS : 0);
  const ratio = balanceCents / DAILY_SIP_CENTS;

  function handleLog() {
    track("demo_started");
    setSpent(true);
    setRevealed(false);
    const delay = prefersReducedMotion() ? 0 : ANIMATION_MS;
    window.setTimeout(() => {
      setRevealed(true);
      track("demo_completed");
    }, delay);
  }

  function handleReset() {
    setSpent(false);
    setRevealed(false);
    track("demo_reset");
  }

  return (
    <section id="demo" aria-labelledby="demo-heading" className="mt-10">
      <h2 id="demo-heading" className="font-heading text-ink text-xl font-bold">
        {landing.demo.header}
      </h2>
      <p className="text-ink/70 mt-2 text-sm leading-6">{landing.demo.body}</p>

      <div className="bg-card border-line mt-5 rounded-2xl border p-5 shadow-sm">
        <p className="text-muted text-sm font-bold uppercase tracking-wider">
          {landing.demoCard.safeToSpendLabel}
        </p>
        <div className="text-ink mt-1">
          <S2SNumber cents={balanceCents} durationMs={ANIMATION_MS} />
        </div>
        <FillBar ratio={ratio} durationMs={ANIMATION_MS} />
        <p className="text-muted mt-2 text-sm">
          {landing.demoCard.spentTodayLabel}{" "}
          <span className="text-ink font-bold">
            {spent ? landing.demoCard.spentTodayAfterTap : landing.demoCard.spentTodayInitial}
          </span>
        </p>

        {spent ? (
          <button
            type="button"
            onClick={handleReset}
            className="bg-surface text-ink border-line mt-4 flex h-12 w-full items-center justify-center rounded-full border text-sm font-bold active:scale-[0.98]"
          >
            {landing.demoCard.resetButton}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleLog}
            className="bg-primary mt-4 flex h-12 w-full items-center justify-center rounded-full text-sm font-bold text-white shadow-lg active:scale-[0.98]"
          >
            {landing.demoCard.logButton}
          </button>
        )}
      </div>

      {revealed && (
        <Link
          href="/login"
          onClick={() => track("onboarding_started", { source: "demo" })}
          className="bg-primary font-heading mt-4 flex h-14 w-full items-center justify-center rounded-full text-base font-semibold text-white shadow-lg active:scale-[0.98]"
        >
          {landing.demo.cta}
        </Link>
      )}
    </section>
  );
}
