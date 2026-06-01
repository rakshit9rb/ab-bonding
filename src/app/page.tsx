import Dashboard from "@/components/Dashboard";

// The bonds fetch is multi-second (deep keyset pagination + book/parent enrichment), so we don't
// block the SSR render on it. Render the shell immediately; the Dashboard fetches client-side
// through the stale-while-revalidate /api/markets route and shows the existing skeleton while
// loading. This removes the blocking SSR render and the 60s cache-expiry stall.
export default function Home() {
  return <Dashboard />;
}
