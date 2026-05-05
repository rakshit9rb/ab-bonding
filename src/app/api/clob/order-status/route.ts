import { NextResponse } from "next/server";
import { getClobCreds } from "@/lib/clobServerAuth";
import { fetchClobAuthed } from "@/lib/clobFetch";

async function readJson(res: Response) {
  const text = await res.text();
  if (!res.ok) throw new Error(text || `CLOB request failed with ${res.status}`);
  return text ? JSON.parse(text) : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");
    const orderId = url.searchParams.get("orderId") ?? "";
    const tradeId = url.searchParams.get("tradeId") ?? "";
    const creds = getClobCreds(request, address);
    if (!creds) return NextResponse.json({ error: "CLOB auth required" }, { status: 401 });

    const order = orderId
      ? await readJson(await fetchClobAuthed(creds, "GET", `/order/${orderId}`))
      : null;
    const resolvedTradeId =
      tradeId || (Array.isArray(order?.associate_trades) ? order.associate_trades[0] : "");
    const trades = resolvedTradeId
      ? await readJson(
          await fetchClobAuthed(creds, "GET", "/trades", {
            params: { id: resolvedTradeId, next_cursor: "MA==" },
          }),
        )
      : null;
    const trade = Array.isArray(trades)
      ? trades[0]
      : Array.isArray(trades?.data)
        ? trades.data[0]
        : null;

    return NextResponse.json({
      order,
      trade,
      status: trade?.status ?? order?.status ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Order status check failed" },
      { status: 500 },
    );
  }
}
