import { NextResponse } from "next/server";
import { buildL2Headers, CLOB_URL, getClobCreds } from "@/lib/clobServerAuth";

const ORDER_PATH = "/order";
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

function isStringInt(value: unknown) {
  return typeof value === "string" && /^\d+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const owner =
      typeof body.owner === "string" ? body.owner.toLowerCase() : "";
    const order =
      typeof body.order === "object" && body.order
        ? (body.order as Record<string, unknown>)
        : null;
    const signer =
      typeof order?.signer === "string" ? order.signer.toLowerCase() : "";
    const maker =
      typeof order?.maker === "string" ? order.maker.toLowerCase() : "";
    if (!owner || !order || owner !== signer || owner !== maker) {
      return NextResponse.json(
        { error: "Invalid order owner" },
        { status: 400 },
      );
    }
    if (!ADDRESS_RE.test(owner)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 },
      );
    }
    if ("nonce" in order || "feeRateBps" in order || "taker" in order) {
      return NextResponse.json(
        { error: "V1 order fields are not supported" },
        { status: 400 },
      );
    }
    if (
      !isStringInt(order.timestamp) ||
      !BYTES32_RE.test(
        typeof order.metadata === "string" ? order.metadata : "",
      ) ||
      !BYTES32_RE.test(typeof order.builder === "string" ? order.builder : "")
    ) {
      return NextResponse.json(
        { error: "Invalid V2 order fields" },
        { status: 400 },
      );
    }

    const creds = getClobCreds(owner);
    if (!creds)
      return NextResponse.json(
        { error: "CLOB auth required" },
        { status: 401 },
      );

    const upstreamBody = {
      order: {
        ...order,
        metadata: order.metadata || ZERO_BYTES32,
        builder: order.builder || ZERO_BYTES32,
      },
      owner: creds.apiKey,
      orderType:
        body.orderType === "FOK" || body.orderType === "FAK"
          ? body.orderType
          : "GTC",
      deferExec: body.deferExec === true,
      postOnly: body.postOnly === true,
    };
    const bodyStr = JSON.stringify(upstreamBody);
    const res = await fetch(`${CLOB_URL}${ORDER_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildL2Headers(creds, "POST", ORDER_PATH, bodyStr),
      },
      body: bodyStr,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "Order failed" }, { status: 500 });
  }
}
