"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/** Fires the two authenticated-flow events from spec §6.2. */
export function HomeAnalytics({
  welcome,
  returnedD7,
}: {
  welcome: boolean;
  returnedD7: boolean;
}) {
  useEffect(() => {
    if (welcome) track("onboarding_completed");
  }, [welcome]);

  useEffect(() => {
    if (returnedD7) track("returned_d7");
  }, [returnedD7]);

  return null;
}
