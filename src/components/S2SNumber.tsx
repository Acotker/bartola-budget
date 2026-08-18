"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents, splitCents } from "@/lib/format";

/**
 * The hero Safe-to-Spend numeral. Animates with a brief count transition when
 * the value changes — the product's signature motion (brief §8). Respects
 * prefers-reduced-motion by snapping straight to the final value, and
 * announces the settled value once via a visually-hidden live region rather
 * than on every intermediate animation frame.
 */
export function S2SNumber({
  cents,
  durationMs = 800,
}: {
  cents: number;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(cents);
  const fromRef = useRef(cents);

  useEffect(() => {
    const from = fromRef.current;
    const to = cents;
    if (from === to) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 0 : durationMs;

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cents, durationMs]);

  const { sign, whole, frac } = splitCents(display);
  return (
    <span className="tnum font-heading font-extrabold leading-none tracking-tight">
      <span aria-hidden="true">
        <span className="align-top text-3xl">{sign}$</span>
        <span className="text-7xl">{whole}</span>
        <span className="align-top text-3xl">.{frac}</span>
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {formatCents(cents)}
      </span>
    </span>
  );
}
