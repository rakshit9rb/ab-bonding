import { NextResponse } from "next/server";
import { clearClobCreds, createClobCreds } from "@/lib/clobServerAuth";

export async function POST(request: Request) {
  try {
    const creds = await createClobCreds(await request.json());
    if (!creds) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: true, address: creds.address });
  } catch (error) {
    console.error("[clob/auth] auth failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "development" && error instanceof Error
            ? error.message
            : undefined,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    clearClobCreds(body.address);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
