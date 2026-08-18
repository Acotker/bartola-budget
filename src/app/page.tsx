import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { landing } from "@/content/landing";
import { LandingAnalytics } from "@/components/LandingAnalytics";
import { LandingDemo } from "@/components/LandingDemo";
import { FinalCtaLink } from "@/components/FinalCtaLink";
import { EmailFallbackForm } from "@/components/EmailFallbackForm";
import { Reveal } from "@/components/Reveal";

export const dynamic = "force-dynamic";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await getSessionUserId();
  if (userId) redirect("/home");

  const params = await searchParams;
  const subscribed = params.subscribed === "1";

  return (
    <>
      <LandingAnalytics />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-16 pt-10">
        {/* Hero — renders immediately, no reveal delay on first paint */}
        <section>
          <h1 className="font-heading text-ink text-3xl font-extrabold leading-tight sm:text-4xl">
            {landing.hero.headline}
          </h1>
          <p className="text-ink/70 mt-4 text-base leading-7">{landing.hero.subhead}</p>
          <a
            href="#demo"
            className="bg-primary font-heading mt-6 flex h-14 w-full items-center justify-center rounded-full text-base font-semibold text-white shadow-lg active:scale-[0.98]"
          >
            {landing.hero.cta}
          </a>
        </section>

        {/* Interactive demo */}
        <LandingDemo />

        {/* Problem — "Day 83", paced as an escalating confession */}
        <section className="mt-16">
          <Reveal>
            <p className="text-ink/80 text-base leading-7">{landing.problem.paragraphs[0]}</p>
          </Reveal>
          <Reveal className="mt-5">
            <p className="text-ink/80 text-base leading-7">{landing.problem.paragraphs[1]}</p>
          </Reveal>
          <Reveal className="mt-7">
            <p className="font-heading text-ink text-2xl leading-snug font-extrabold">
              {landing.problem.paragraphs[2]}
            </p>
          </Reveal>
          <Reveal className="mt-7">
            <p className="text-ink/80 text-base leading-7">{landing.problem.paragraphs[3]}</p>
          </Reveal>
          <Reveal className="mt-7">
            <p className="text-ink/80 text-base leading-7">
              {landing.problem.lastParagraphLead}{" "}
              <strong className="font-heading text-ink text-xl font-extrabold not-italic">
                {landing.problem.emphasis}
              </strong>
            </p>
          </Reveal>
        </section>

        {/* Solution */}
        <Reveal className="mt-16">
          <section>
            <h2 className="font-heading text-ink text-2xl font-bold">
              {landing.solution.header}
            </h2>
            {landing.solution.bodyParagraphs.map((p, i) => (
              <p key={i} className="text-ink/80 mt-3 text-base leading-7">
                {p}
              </p>
            ))}
            <div className="border-line bg-card mt-5 rounded-2xl border p-5 shadow-sm">
              <p className="font-heading text-ink text-base font-bold">
                {landing.solution.deltaHeader}
              </p>
              <p className="text-ink/80 mt-2 text-sm leading-6">{landing.solution.deltaBody}</p>
            </div>
          </section>
        </Reveal>

        {/* Forgiveness */}
        <Reveal className="mt-16">
          <section>
            <h2 className="font-heading text-ink text-2xl font-bold">
              {landing.forgiveness.header}
            </h2>
            <p className="text-ink/80 mt-3 text-base leading-7">
              {landing.forgiveness.bodyParagraphs[0]}
            </p>
            <div className="border-line bg-card mt-5 flex items-center justify-center gap-3 rounded-2xl border p-5 shadow-sm">
              <span className="tnum font-heading text-ink/40 text-xl font-bold line-through">
                $83.84
              </span>
              <span className="text-ink/40 text-lg">→</span>
              <span className="tnum font-heading text-ink text-2xl font-extrabold">$83.79</span>
            </div>
            <p className="text-ink/80 mt-5 text-base leading-7">
              {landing.forgiveness.bodyParagraphs[1]}
            </p>
          </section>
        </Reveal>

        {/* Second year */}
        <Reveal className="mt-16">
          <section>
            <h2 className="font-heading text-ink text-2xl font-bold">
              {landing.secondYear.header}
            </h2>
            {landing.secondYear.bodyParagraphs.map((p, i) => (
              <p key={i} className="text-ink/80 mt-3 text-base leading-7">
                {p}
              </p>
            ))}
            <div className="border-line bg-card mt-5 rounded-2xl border p-4 shadow-sm">
              <p className="text-ink/80 text-sm leading-6">{landing.secondYear.card}</p>
            </div>
          </section>
        </Reveal>

        {/* Differentiation */}
        <Reveal className="mt-16">
          <section>
            <h2 className="font-heading text-ink text-2xl font-bold">
              {landing.differentiation.header}
            </h2>
            <div className="mt-5 space-y-3">
              {landing.differentiation.axes.map((axis, i) => (
                <div
                  key={i}
                  className="border-line bg-card flex gap-3 rounded-2xl border p-4 shadow-sm"
                >
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {axis.icon}
                  </span>
                  <div>
                    <p className="font-heading text-ink font-bold">{axis.lead}</p>
                    <p className="text-ink/80 mt-1 text-sm leading-6">{axis.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {
              /* POST-LAUNCH SLOT: real usage stat goes here once we have one.
                 e.g. "X% of our first cohort reached their next refund with money left."
                 Do NOT populate with a placeholder or example value. */
            }

            <div className="mt-8 text-center">
              <p className="font-heading text-ink text-lg font-bold">
                {landing.differentiation.mark}
              </p>
              <p className="text-muted mt-1 text-sm">{landing.differentiation.submark}</p>
            </div>
          </section>
        </Reveal>

        {/* FAQ */}
        <Reveal className="mt-16">
          <section>
            <h2 className="font-heading text-ink text-2xl font-bold">FAQ</h2>
            <dl className="mt-5 space-y-6">
              {landing.faq.map((item, i) => (
                <div key={i}>
                  <dt className="font-heading text-ink font-bold">{item.q}</dt>
                  <dd className="text-ink/80 mt-1 text-sm leading-6">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </Reveal>

        {/* Final CTA + email fallback */}
        <Reveal className="mt-16 pb-4">
          <section>
            <h2 className="font-heading text-ink text-2xl font-bold">
              {landing.finalCta.header}
            </h2>
            <div className="mt-5">
              <FinalCtaLink>{landing.finalCta.cta}</FinalCtaLink>
            </div>
            <p className="text-muted mt-3 text-xs">{landing.finalCta.microcopy}</p>

            <p className="text-muted mt-10 text-xs">{landing.finalCta.emailLine}</p>
            <EmailFallbackForm subscribed={subscribed} />
          </section>
        </Reveal>
      </main>
    </>
  );
}
