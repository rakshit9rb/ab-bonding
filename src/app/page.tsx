import { DEFAULT_MIN_PROBABILITY, fetchBonds } from "@/lib/bond-data";
import Dashboard from "@/components/Dashboard";

export const revalidate = 60;

export default async function Home() {
  let initialBonds: Awaited<ReturnType<typeof fetchBonds>>;
  let initialFetchedAt = "";
  try {
    initialBonds = await fetchBonds(DEFAULT_MIN_PROBABILITY);
    initialFetchedAt = new Date().toISOString();
  } catch {
    initialBonds = [];
  }
  return <Dashboard initialBonds={initialBonds} initialFetchedAt={initialFetchedAt} />;
}
