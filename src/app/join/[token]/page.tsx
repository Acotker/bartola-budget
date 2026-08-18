import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { getInviteView } from "@/lib/data";
import { loginAction, signupAction } from "@/app/auth-actions";
import { acceptInviteAction } from "@/app/invite-actions";
import { prisma } from "@/lib/db";
import { formatCents, formatDateYear } from "@/lib/format";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  has_plan:
    "You already have a Sip plan of your own — joining a household isn't supported for existing plans yet. Ask your partner to check with support.",
  invalid: "This invite isn't valid anymore.",
};

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const errorMsg =
    typeof sp.error === "string" ? ERROR_MESSAGES[sp.error] ?? null : null;

  const view = await getInviteView(token);

  if (!view || view.status === "not_found") {
    return (
      <ErrorScreen message="This invite link doesn't exist. Ask your partner to send a fresh one." />
    );
  }
  if (view.status === "used") {
    return (
      <ErrorScreen message="This invite has already been used. If that wasn't you, ask your partner for a new link." />
    );
  }

  const userId = await getSessionUserId();

  if (!userId) {
    // Not logged in — log in or sign up, carrying this invite through.
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <h1 className="font-heading text-ink text-2xl font-bold">
          {view.proposerName} invited you to Sip
        </h1>
        <p className="text-ink/70 mt-2 text-sm leading-6">
          Log in or create an account to see what they set up and add your own
          numbers.
        </p>
        <form action={loginAction} className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="next" value={`/join/${token}`} />
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            Log in
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="you@email.com"
            className="bg-card text-ink placeholder:text-ink/30 rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Password"
            className="bg-card text-ink placeholder:text-ink/30 rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
          <button
            type="submit"
            className="bg-primary flex h-12 items-center justify-center rounded-full text-sm font-bold text-white shadow-lg active:scale-[0.98]"
          >
            Log in
          </button>
        </form>
        <div className="text-ink/40 my-6 flex items-center gap-3 text-xs">
          <span className="bg-ink/10 h-px flex-1" /> or{" "}
          <span className="bg-ink/10 h-px flex-1" />
        </div>
        <form action={signupAction} className="flex flex-col gap-3">
          <input type="hidden" name="next" value={`/join/${token}`} />
          <label className="text-ink/50 text-xs font-bold uppercase tracking-wider">
            Create an account
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="you@email.com"
            className="bg-card text-ink placeholder:text-ink/30 rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Choose a password (6+ characters)"
            className="bg-card text-ink placeholder:text-ink/30 rounded-xl px-4 py-3 text-sm shadow-sm outline-none"
          />
          <button
            type="submit"
            className="border-primary text-primary flex h-12 items-center justify-center rounded-full border text-sm font-bold active:scale-[0.98]"
          >
            Sign up
          </button>
        </form>
      </main>
    );
  }

  // Logged in. Already part of a household? Nothing to accept.
  const existingMember = await prisma.member.findFirst({ where: { userId } });
  if (existingMember) redirect("/household");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <h1 className="font-heading text-ink text-2xl font-bold">
        {view.proposerName} proposed this
      </h1>
      <p className="text-ink/70 mt-2 text-sm leading-6">
        Your money has its own window — from{" "}
        <span className="font-bold">{formatDateYear(view.horizonStart)}</span> to{" "}
        <span className="font-bold">{formatDateYear(view.horizonEnd)}</span>,
        matching theirs. You&apos;ll keep your own Safe-to-Spend; here&apos;s
        what you&apos;d share.
      </p>

      {errorMsg && (
        <p className="border-alert/30 bg-alert/5 text-alert mt-4 rounded-xl border px-4 py-3 text-sm">
          {errorMsg}
        </p>
      )}

      <section className="mt-6 space-y-2">
        <h2 className="text-muted text-xs font-bold uppercase tracking-wider">
          Shared costs
        </h2>
        {view.sharedObligations.length === 0 ? (
          <p className="text-muted text-sm">None set up yet — you can add some together later.</p>
        ) : (
          view.sharedObligations.map((o, i) => (
            <div
              key={i}
              className="bg-card border-line flex items-center justify-between rounded-xl border px-4 py-3"
            >
              <div>
                <p className="text-ink text-sm font-bold">{o.name}</p>
                <p className="text-muted text-xs">{o.splitLabel}</p>
              </div>
              <span className="tnum text-ink text-sm font-bold">
                {formatCents(o.amountPerOccurrenceCents)}
                {o.freq && <span className="text-muted text-xs">/{o.freq}</span>}
              </span>
            </div>
          ))
        )}
      </section>

      <form action={acceptInviteAction} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="bg-primary flex h-14 w-full items-center justify-center rounded-full text-base font-bold text-white shadow-lg active:scale-[0.98]"
        >
          Accept & add my numbers
        </button>
      </form>
      <Link href="/" className="text-muted mt-3 text-center text-xs font-bold">
        Not now
      </Link>
    </main>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12 text-center">
      <h1 className="font-heading text-ink text-xl font-bold">
        This invite isn&apos;t available
      </h1>
      <p className="text-ink/70 mt-2 text-sm leading-6">{message}</p>
      <Link href="/" className="text-primary mt-6 text-sm font-bold">
        Go to Sip
      </Link>
    </main>
  );
}
