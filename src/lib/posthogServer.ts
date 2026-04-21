import { PostHog } from "posthog-node";

let client: PostHog | null = null;

export const getPostHogServer = () => {
  if (client) return client;
  const key = process.env.POSTHOG_PROJECT_API_KEY;
  if (!key) return null;
  client = new PostHog(key, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
  });
  return client;
};
