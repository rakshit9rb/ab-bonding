import { PostHog } from "posthog-node";

let client: PostHog | null = null;

export const getPostHogServer = () => {
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
  });
  return client;
};
