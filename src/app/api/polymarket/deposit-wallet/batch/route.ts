import { NextRequest, NextResponse } from "next/server";
import {
  derivePolymarketDepositWallet,
  fetchDepositWalletNonce,
  normalizeAddress,
  submitDepositWalletBatch,
} from "@/lib/polymarketDepositWallet";

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const MAX_UINT256 = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const CONDITIONAL_TOKENS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const CTF_EXCHANGE = "0xe111180000d2663c0091e4f400237545b87b996b";
const NEG_RISK_CTF_EXCHANGE = "0xe2222d279d744050d28e00520010520000310f59";
const NEG_RISK_ADAPTER = "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296";
const APPROVE_SELECTOR = "0x095ea7b3";
const SET_APPROVAL_FOR_ALL_SELECTOR = "0xa22cb465";

function padAddress(address: string) {
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function isAllowedApprovalCall(call: unknown) {
  if (!isValidCall(call)) return false;
  const c = call as { target: string; value: string; data: string };
  if (c.value !== "0") return false;

  const target = c.target.toLowerCase();
  const data = c.data.toLowerCase();
  const exchanges = [CTF_EXCHANGE, NEG_RISK_CTF_EXCHANGE, NEG_RISK_ADAPTER];

  if (target === PUSD) {
    const expectedLength = 2 + 8 + 64 + 64;
    return (
      data.length === expectedLength &&
      data.startsWith(APPROVE_SELECTOR) &&
      exchanges.some((exchange) => data.slice(10, 74) === padAddress(exchange)) &&
      data.slice(74) === MAX_UINT256
    );
  }

  if (target === CONDITIONAL_TOKENS) {
    const expectedLength = 2 + 8 + 64 + 64;
    return (
      data.length === expectedLength &&
      data.startsWith(SET_APPROVAL_FOR_ALL_SELECTOR) &&
      exchanges.some((exchange) => data.slice(10, 74) === padAddress(exchange)) &&
      data.slice(74) === "0000000000000000000000000000000000000000000000000000000000000001"
    );
  }

  return false;
}

function isValidCall(call: unknown) {
  if (!call || typeof call !== "object") return false;
  const c = call as { target?: unknown; value?: unknown; data?: unknown };
  return (
    normalizeAddress(c.target) !== null &&
    typeof c.value === "string" &&
    /^\d+$/.test(c.value) &&
    typeof c.data === "string" &&
    HEX_RE.test(c.data)
  );
}

export async function GET(req: NextRequest) {
  const owner = normalizeAddress(req.nextUrl.searchParams.get("owner"));
  if (!owner) return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
  try {
    const nonce = await fetchDepositWalletNonce(owner);
    return NextResponse.json({ nonce });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not fetch nonce" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const owner = normalizeAddress(body?.owner);
  const depositWallet = normalizeAddress(body?.depositWallet);
  const expectedDepositWallet = owner ? derivePolymarketDepositWallet(owner).toLowerCase() : "";
  if (!owner || !depositWallet || depositWallet !== expectedDepositWallet) {
    return NextResponse.json({ error: "Invalid deposit wallet owner" }, { status: 400 });
  }
  if (
    typeof body?.nonce !== "string" ||
    !/^\d+$/.test(body.nonce) ||
    typeof body?.deadline !== "string" ||
    !/^\d+$/.test(body.deadline) ||
    typeof body?.signature !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(body.signature) ||
    !Array.isArray(body?.calls) ||
    body.calls.length === 0 ||
    !body.calls.every(isAllowedApprovalCall)
  ) {
    return NextResponse.json({ error: "Invalid batch payload" }, { status: 400 });
  }

  try {
    const result = await submitDepositWalletBatch({
      owner,
      depositWallet,
      nonce: body.nonce,
      deadline: body.deadline,
      signature: body.signature,
      calls: body.calls,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not submit batch" }, { status: 502 });
  }
}
