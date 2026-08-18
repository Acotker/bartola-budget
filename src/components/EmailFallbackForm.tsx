"use client";

import { emailSignupAction } from "@/app/landing-actions";
import { track } from "@/lib/analytics";

export function EmailFallbackForm({ subscribed }: { subscribed: boolean }) {
  if (subscribed) {
    return <p className="text-muted mt-6 text-xs">Thanks — we&apos;ll be in touch.</p>;
  }

  return (
    <form
      action={emailSignupAction}
      onSubmit={() => track("email_captured")}
      className="mt-6 flex items-center gap-2"
    >
      <label htmlFor="landing-email" className="sr-only">
        Email address
      </label>
      <input
        id="landing-email"
        name="email"
        type="email"
        required
        placeholder="you@email.com"
        className="text-ink placeholder:text-ink/40 min-w-0 flex-1 border-b border-line bg-transparent py-1 text-xs outline-none"
      />
      <button type="submit" className="text-muted shrink-0 text-xs font-bold">
        Submit
      </button>
    </form>
  );
}
