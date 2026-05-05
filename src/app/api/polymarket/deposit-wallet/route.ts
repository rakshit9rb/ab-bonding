import { NextResponse } from "next/server";
import {
  derivePolymarketDepositWallet,
  fetchDepositWalletDeployed,
  normalizeAddress,
  submitDepositWalletDeploy,
} from "@/lib/polymarketDepositWallet";

export async function GET(request: Request) {
  try {
    const owner = normalizeAddress(new URL(request.url).searchParams.get("owner"));
    if (!owner) return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });

    const address = derivePolymarketDepositWallet(owner);
    const deployed = await fetchDepositWalletDeployed(address).catch(() => false);
    return NextResponse.json({ address, deployed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not resolve deposit wallet" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const owner = normalizeAddress(body?.owner);
    if (!owner) return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });

    const address = derivePolymarketDepositWallet(owner);
    const deployed = await fetchDepositWalletDeployed(address).catch(() => false);
    if (deployed) return NextResponse.json({ address, deployed: true });

    const deploy = await submitDepositWalletDeploy(owner);
    return NextResponse.json({ address, deployed: false, deploy });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not deploy deposit wallet" },
      { status: 500 },
    );
  }
}
