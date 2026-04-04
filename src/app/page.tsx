import { DEFAULT_MIN_PROBABILITY, fetchBonds } from "@/lib/bond-data";
import Dashboard from "@/components/Dashboard";

export const revalidate = 60;

export default async function Home() {
  let initialBonds: Awaited<ReturnType<typeof fetchBonds>>;
  try {
    initialBonds = await fetchBonds(DEFAULT_MIN_PROBABILITY);
  } catch {
    initialBonds = [];
  }
  return <Dashboard initialBonds={initialBonds} />;
}
