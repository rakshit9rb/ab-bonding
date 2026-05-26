import { NextResponse } from "next/server";
import { Bond, calcAPY } from "@/lib/bonds";

export const revalidate = 60;

const GAMMA = "https://gamma-api.polymarket.com";
const LIMIT = 500;

function parsePrice(m: Record<string, unknown>): number | null {
  try {
    if (m.outcomePrices) {
      const prices =
        typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices as string)
          : m.outcomePrices;
      return parseFloat((prices as string[])[0]);
    }
    for (const key of ["lastTradePrice", "price", "bestAsk"]) {
      if (m[key] != null) return parseFloat(m[key] as string);
    }
  } catch {}
  return null;
}

export async function GET() {
  try {
    const url = `${GAMMA}/markets?closed=false&uma_resolution_status=disputed&limit=${LIMIT}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "OnlyBonds/1.0" },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const markets: Record<string, unknown>[] = Array.isArray(data) ? data : (data.markets ?? []);

    const seen = new Set<string>();
    const bonds: Bond[] = [];
    const now = new Date();

    for (const m of markets) {
      const id = String(m.conditionId || m.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);

      if (m.closed === true || m.resolved === true || m.active === false) continue;

      const price = parsePrice(m);
      const endDate = String(m.endDate || m.endDateIso || "");
      if (endDate && !endDate.startsWith("2026-12-31") && new Date(endDate) <= now) continue;

      const slug = String(
        (Array.isArray(m.events) && (m.events as any[]).length > 0
          ? (m.events as any[])[0]?.slug
          : null) ||
          m.slug ||
          m.conditionId ||
          "",
      );

      let clobTokenIds: [string, string] | null = null;
      try {
        const raw = m.clobTokenIds;
        const ids: string[] = typeof raw === "string" ? JSON.parse(raw) : ((raw as string[]) ?? []);
        if (ids[0] && ids[1]) clobTokenIds = [ids[0], ids[1]];
      } catch {}

      bonds.push({
        id,
        conditionId: id,
        question: String(m.question || m.title || "Unknown"),
        slug,
        category: "Disputed",
        outcome: "YES",
        price: price ?? 0,
        apy: price && endDate && !endDate.startsWith("2026-12-31") ? calcAPY(price, endDate) : null,
        endDate,
        volume: parseFloat(String(m.volume24hr || m.volumeNum || m.volumeClob || m.volume || 0)),
        liquidity: parseFloat(String(m.liquidityNum || m.liquidityClob || m.liquidity || 0)),
        clobTokenIds,
        negRisk: Boolean(m.negRisk),
      });
    }

    return NextResponse.json({
      disputes: bonds,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to fetch disputes:", err);
    return NextResponse.json({ error: "Failed to fetch disputes" }, { status: 500 });
  }
}
