import type { HomeCrunch } from "@/lib/data";
import { formatCents, formatShortDate } from "@/lib/format";

/**
 * Liquidity strip (§6.2). Shows the next crunch point within 60 days: a day the
 * account physically dips below the safety floor before money lands. It never
 * blocks and never changes the daily number — the daily is computed on the pool,
 * not capped by cash (§2.2). Same calm voice as the deficit banner.
 */
export function CrunchStrip({ crunch }: { crunch: HomeCrunch }) {
  return (
    <section className="border-alert/30 bg-alert/5 mt-5 rounded-2xl border px-4 py-3">
      <p className="text-alert text-xs font-bold uppercase tracking-wide">
        Heads up — cash gets tight
      </p>
      <p className="text-ink mt-1 text-sm leading-6">
        On <span className="font-bold">{formatShortDate(crunch.date)}</span>{" "}
        you&apos;re{" "}
        <span className="tnum font-bold">
          {formatCents(crunch.shortfallCents)}
        </span>{" "}
        below your safety floor.
        {crunch.clearsOn ? (
          <>
            {" "}
            Money lands{" "}
            <span className="font-bold">{formatShortDate(crunch.clearsOn)}</span>.
          </>
        ) : (
          <> It doesn&apos;t recover on its own before your runway ends.</>
        )}
      </p>
      <p className="text-muted mt-1 text-xs">
        Your daily sip is unaffected — this is just a timing heads-up.
      </p>
    </section>
  );
}
