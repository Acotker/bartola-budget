import { loginAction, signupAction } from "@/app/auth-actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  invalid: "Enter a valid email and a password of at least 6 characters.",
  exists: "That email already has an account — log in instead.",
  bad: "Email or password didn't match.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? MESSAGES[params.error] : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      <h1 className="font-heading text-ink text-3xl font-extrabold">
        Bartola Budget
      </h1>
      <p className="text-ink/60 mt-1 text-sm">
        One number a day: what&apos;s safe to spend.
      </p>

      {error && (
        <p className="border-alert/30 bg-alert/5 text-alert mt-6 rounded-xl border px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <form action={loginAction} className="mt-8 flex flex-col gap-3">
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
        <span className="bg-ink/10 h-px flex-1" /> or <span className="bg-ink/10 h-px flex-1" />
      </div>

      <form action={signupAction} className="flex flex-col gap-3">
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

      <p className="text-ink/40 mt-8 text-center text-xs">
        Try the demo: <span className="font-bold">maria@demo.bartola</span> /
        demo1234
      </p>
    </main>
  );
}
