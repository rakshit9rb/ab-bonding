import { NextResponse } from "next/server";
import { checkPolymarketGeoblock } from "@/lib/polymarketGeoblock";

export async function GET(request: Request) {
  try {
    const result = await checkPolymarketGeoblock(request.headers);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        blocked: true,
        source: "polymarket",
        reason: "Could not verify Polymarket availability for this region.",
      },
      { status: 503 },
    );
  }
}
