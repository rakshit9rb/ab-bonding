import posthog, { type PostHogInterface } from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  try {
    posthog.init(key, {
      api_host:
        typeof window === "undefined"
          ? process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
          : new URL("/ingest", window.location.origin).toString(),
      ui_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: true,
      defaults: "2025-05-24",
      person_profiles: "identified_only",
      loaded: (client) => {
        if (process.env.NODE_ENV !== "production") {
          client.debug();
        }

        window.posthog = client;
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Failed to initialize PostHog", error);
    }
  }
}

declare global {
  interface Window {
    posthog?: PostHogInterface;
  }
}
