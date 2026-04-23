import { NextResponse } from "next/server";
import { buildL2Headers, CLOB_URL, getClobCreds } from "@/lib/clobServerAuth";

const ORDER_PATH = "/order";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const owner = typeof body.owner === "string" ? body.owner.toLowerCase() : "";
    const order =
      typeof body.order === "object" && body.order
        ? (body.order as Record<string, unknown>)
        : null;
    const signer = typeof order?.signer === "string" ? order.signer.toLowerCase() : "";
    const maker = typeof order?.maker === "string" ? order.maker.toLowerCase() : "";
    if (!owner || !order || owner !== signer || owner !== maker) {
      return NextResponse.json({ error: "Invalid order owner" }, { status: 400 });
    }

    const creds = getClobCreds(owner);
    if (!creds) return NextResponse.json({ error: "CLOB auth required" }, { status: 401 });

    const bodyStr = JSON.stringify(body);
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
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Order failed" }, { status: 500 });
  }
}
