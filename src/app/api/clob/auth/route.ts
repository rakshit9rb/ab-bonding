import { NextResponse } from "next/server";
import { clearClobCreds, createClobCreds } from "@/lib/clobServerAuth";

export async function POST(request: Request) {
  try {
    const creds = await createClobCreds(await request.json());
    if (!creds) return NextResponse.json({ ok: false }, { status: 401 });
    return NextResponse.json({ ok: true, address: creds.address });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
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
