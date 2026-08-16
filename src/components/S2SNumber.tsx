"use client";

import { useEffect, useRef, useState } from "react";
import { splitCents } from "@/lib/format";

/**
 * The hero Safe-to-Spend numeral. Animates with a brief count transition when
 * the value changes — the product's signature motion (brief §8).
 */
export function S2SNumber({ cents }: { cents: number }) {
  const [display, setDisplay] = useState(cents);
  const fromRef = useRef(cents);

  useEffect(() => {
    const from = fromRef.current;
    const to = cents;
    if (from === to) return;

    let raf = 0;
    const start = performance.now();
    const duration = 800;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
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
  }, [cents]);

  const { sign, whole, frac } = splitCents(display);
  return (
    <span className="tnum font-heading font-extrabold leading-none tracking-tight">
      <span className="align-top text-3xl">{sign}$</span>
      <span className="text-7xl">{whole}</span>
      <span className="align-top text-3xl">.{frac}</span>
    </span>
  );
}
