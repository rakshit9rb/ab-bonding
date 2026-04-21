"use client";
import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PostHogProviderBase } from "posthog-js/react";

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: "identified_only",
    });
  }, []);

  return <PostHogProviderBase client={posthog}>{children}</PostHogProviderBase>;
}
