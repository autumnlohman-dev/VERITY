"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Env-gated PostHog init. Configured for a health-adjacent product:
 * no autocapture, no session recording, explicit events only (src/lib/
 * analytics.ts), and person profiles only after identify() at login.
 */
export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: "history_change",
      disable_session_recording: true,
      person_profiles: "identified_only",
      respect_dnt: true,
    });
  }, []);

  return <>{children}</>;
}
