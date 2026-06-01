import { NextResponse } from "next/server";
import { fetchBonds } from "@/lib/bonds";

export const revalidate = 60;

type Entry = { bonds: Awaited<ReturnType<typeof fetchBonds>>; at: number; refreshing?: boolean };

// In-memory cache — survives across requests in the same server process.
const cache = new Map<number, Entry>();
const SOFT_TTL = 60_000; // under this age, serve as fresh
const HARD_TTL = 10 * 60_000; // above this, must refetch synchronously

function payload(entry: Entry, extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    bonds: entry.bonds,
    fetchedAt: new Date(entry.at).toISOString(),
    ...extra,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minProb = parseFloat(searchParams.get("minProb") ?? "0.90");
  const entry = cache.get(minProb);
  const now = Date.now();

  if (entry) {
    const age = now - entry.at;
    if (age < SOFT_TTL) return payload(entry, { cached: true });
    if (age < HARD_TTL) {
      // Stale-while-revalidate: serve the stale set instantly and refresh once in the background,
      // so no request ever blocks on the multi-second deep fetch (and no thundering herd on expiry).
      if (!entry.refreshing) {
        entry.refreshing = true;
        void fetchBonds(minProb)
          .then((bonds) => cache.set(minProb, { bonds, at: Date.now() }))
          .catch(() => {})
          .finally(() => {
            entry.refreshing = false;
          });
      }
      return payload(entry, { cached: true, stale: true });
    }
  }

  try {
    const bonds = await fetchBonds(minProb);
    const fresh: Entry = { bonds, at: Date.now() };
    cache.set(minProb, fresh);
    return payload(fresh);
  } catch (err) {
    console.error("Failed to fetch bonds:", err);
    if (entry) return payload(entry, { stale: true }); // serve last-known set on error
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
