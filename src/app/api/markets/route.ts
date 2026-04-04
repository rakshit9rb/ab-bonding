import { NextResponse } from "next/server";
import { fetchBonds, parseMinProbability } from "@/lib/bond-data";

export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minProb = parseMinProbability(searchParams.get("minProb"));

  try {
    const bonds = await fetchBonds(minProb);
    return NextResponse.json({ bonds, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Failed to fetch bonds:", err);
    return NextResponse.json({ error: "Failed to fetch markets" }, { status: 500 });
  }
}
