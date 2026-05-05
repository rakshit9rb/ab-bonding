import { NextResponse } from "next/server";
import { clearClobCredsCookie, createClobCreds, setClobCredsCookie } from "@/lib/clobServerAuth";

export async function POST(request: Request) {
  try {
    const creds = await createClobCreds(await request.json());
    if (!creds) return NextResponse.json({ ok: false }, { status: 401 });
    const response = NextResponse.json({ ok: true, address: creds.address });
    setClobCredsCookie(response, creds);
    return response;
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
    await request.json().catch(() => null);
    const response = NextResponse.json({ ok: true });
    clearClobCredsCookie(response);
    return response;
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
