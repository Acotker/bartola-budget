"use client";

import { useEffect } from "react";
import {
  track,
  startLandingSessionRecording,
  stopLandingSessionRecording,
  utmParamsFromLocation,
} from "@/lib/analytics";

/**
 * Fires landing_page_view once on mount and scopes session replay to exactly
 * the time a visitor spends on the public landing route — recording starts
 * here and stops the moment this component unmounts (i.e. the visitor
 * navigates away, toward login/onboarding/home, where replay must stay off).
 */
export function LandingAnalytics() {
  useEffect(() => {
    track("landing_page_view", {
      referrer: document.referrer || null,
      ...utmParamsFromLocation(),
    });
    startLandingSessionRecording();
    return () => stopLandingSessionRecording();
  }, []);

  return null;
}
