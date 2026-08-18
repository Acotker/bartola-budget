"use client";

// Thin analytics wrapper (spec §6). One place to grep for every event name;
// swap the provider here and nothing else in the app has to change.
//
// Requires env vars (never committed — see .env.local, .env*  is gitignored):
//   NEXT_PUBLIC_POSTHOG_KEY   — PostHog project API key
//   NEXT_PUBLIC_POSTHOG_HOST  — e.g. https://us.i.posthog.com or https://eu.i.posthog.com
// Without a key, track()/session recording become no-ops so local dev and
// CI never fail for lack of credentials.

import posthog from "posthog-js";

let initialized = false;

function client(): typeof posthog | null {
  if (typeof window === "undefined") return null;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;

  if (!initialized) {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      person_profiles: "always",
      capture_pageview: false,
      // Off by default everywhere. Only the landing route turns this on for
      // itself (startLandingSessionRecording) — authenticated pages never do.
      disable_session_recording: true,
      autocapture: true,
    });
    initialized = true;
  }
  return posthog;
}

/** Fire a named analytics event. No-op if PostHog isn't configured. */
export function track(event: string, props?: Record<string, unknown>): void {
  client()?.capture(event, props);
}

/** Turn on session replay for the current browser session (landing page only). */
export function startLandingSessionRecording(): void {
  client()?.startSessionRecording();
}

/** Turn session replay back off (call when leaving the landing page). */
export function stopLandingSessionRecording(): void {
  client()?.stopSessionRecording();
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** Every utm_* param present on the current URL, for attaching to events. */
export function utmParamsFromLocation(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key] = value;
  }
  return utm;
}
