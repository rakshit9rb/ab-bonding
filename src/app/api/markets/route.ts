import { NextResponse } from "next/server";
import { fetchBonds } from "@/lib/bonds";

export const revalidate = 60;

// In-memory cache — survives across requests in the same server process
const cache = new Map<number, { bonds: Awaited<ReturnType<typeof fetchBonds>>; at: number }>();
const CACHE_TTL = 60_000; // 60s

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minProb = parseFloat(searchParams.get("minProb") ?? "0.90");

  const cached = cache.get(minProb);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return NextResponse.json({
      bonds: cached.bonds,
      fetchedAt: new Date(cached.at).toISOString(),
      cached: true,
    });
  }

  try {
    const bonds = await fetchBonds(minProb);
    cache.set(minProb, { bonds, at: Date.now() });
    return NextResponse.json({ bonds, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Failed to fetch bonds:", err);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
