import { NextResponse } from "next/server";
import { getClobCreds } from "@/lib/clobServerAuth";
import { fetchClobAuthed } from "@/lib/clobFetch";

const END_CURSOR = "LTE=";
const INITIAL_CURSOR = "MA==";

interface OpenOrder {
  asset_id?: string;
  side?: string;
  original_size?: string;
  size_matched?: string;
  price?: string;
}

function parseClobNumber(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  const text = String(value);
  if (!/^\d+$/.test(text)) {
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const raw = Number.parseInt(text, 10);
  if (!Number.isFinite(raw)) return 0;
  return raw > 1_000_000 ? raw / 1_000_000 : raw;
}

async function readJson(res: Response) {
  const text = await res.text();
  if (!res.ok) throw new Error(text || `CLOB request failed with ${res.status}`);
  return text ? JSON.parse(text) : null;
}

async function getBalanceAllowance(
  creds: NonNullable<ReturnType<typeof getClobCreds>>,
  params: Record<string, string>,
  signatureType: "0" | "3",
) {
  if (signatureType === "3") {
    await fetchClobAuthed(creds, "GET", "/balance-allowance/update", {
      params: { ...params, signature_type: signatureType },
    }).catch(() => null);
  }
  const data = await readJson(
    await fetchClobAuthed(creds, "GET", "/balance-allowance", {
      params: { ...params, signature_type: signatureType },
    }),
  );
  return {
    balance: parseClobNumber(data?.balance),
    allowance: parseClobNumber(data?.allowance),
  };
}

async function getOpenOrders(creds: NonNullable<ReturnType<typeof getClobCreds>>) {
  const orders: OpenOrder[] = [];
  let cursor = INITIAL_CURSOR;
  for (let page = 0; page < 5 && cursor !== END_CURSOR; page += 1) {
    const data = await readJson(
      await fetchClobAuthed(creds, "GET", "/data/orders", {
        params: { next_cursor: cursor },
      }),
    );
    const nextOrders = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
    orders.push(...nextOrders);
    const nextCursor = typeof data?.next_cursor === "string" ? data.next_cursor : END_CURSOR;
    cursor = nextCursor || END_CURSOR;
  }
  return orders;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");
    const tokenId = url.searchParams.get("tokenId") ?? undefined;
    const signatureType = url.searchParams.get("signatureType") === "3" ? "3" : "0";
    const creds = getClobCreds(address);
    if (!creds) return NextResponse.json({ error: "CLOB auth required" }, { status: 401 });

    const [collateral, conditional, openOrders] = await Promise.all([
      getBalanceAllowance(creds, { asset_type: "COLLATERAL" }, signatureType),
      tokenId
        ? getBalanceAllowance(
            creds,
            { asset_type: "CONDITIONAL", token_id: tokenId },
            signatureType,
          )
        : Promise.resolve(null),
      getOpenOrders(creds),
    ]);

    let reservedCollateral = 0;
    let reservedConditional = 0;
    for (const order of openOrders) {
      const remaining = Math.max(
        parseClobNumber(order.original_size) - parseClobNumber(order.size_matched),
        0,
      );
      const side = order.side?.toUpperCase();
      if (side === "BUY") {
        reservedCollateral += remaining * parseClobNumber(order.price);
      } else if (side === "SELL" && tokenId && order.asset_id === tokenId) {
        reservedConditional += remaining;
      }
    }

    return NextResponse.json({
      collateral: {
        ...collateral,
        reserved: reservedCollateral,
        available: Math.max(collateral.balance - reservedCollateral, 0),
      },
      conditional: conditional
        ? {
            ...conditional,
            reserved: reservedConditional,
            available: Math.max(conditional.balance - reservedConditional, 0),
          }
        : null,
      openOrderCount: openOrders.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CLOB account check failed" },
      { status: 500 },
    );
  }
}
