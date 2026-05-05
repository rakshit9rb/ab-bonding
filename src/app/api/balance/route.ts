import { NextRequest, NextResponse } from "next/server";

const PUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CONDITIONAL_TOKENS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const RPCS = ["https://lb.drpc.live/polygon/AlvF7CBZW0JoqfEAgCDdl6DG-763PyIR8ZoJtiKh6MJI"];

async function ethCall(to: string, data: string): Promise<string | null> {
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to, data }, "latest"],
        }),
        signal: AbortSignal.timeout(5000),
      });
      const json = await res.json();
      if (json.result && json.result !== "0x") return json.result as string;
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") ?? "";
  const spender = req.nextUrl.searchParams.get("spender") ?? "";
  const ctfOperator = req.nextUrl.searchParams.get("ctfOperator") ?? "";
  const asset = req.nextUrl.searchParams.get("asset") === "usdce" ? USDCE : PUSD;

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ balance: 0, allowance: null, ctfApproval: false });
  }

  const padAddr = address.slice(2).toLowerCase().padStart(64, "0");

  const balanceResult = await ethCall(asset, `0x70a08231${padAddr}`);
  const balance = balanceResult === null ? null : parseInt(balanceResult, 16) / 1e6;

  // allowance(owner, spender) — optional
  let allowance: number | null = null;
  if (/^0x[0-9a-fA-F]{40}$/.test(spender)) {
    const padSpender = spender.slice(2).toLowerCase().padStart(64, "0");
    const allowResult = await ethCall(asset, `0xdd62ed3e${padAddr}${padSpender}`);
    allowance = allowResult === null ? null : parseInt(allowResult, 16) / 1e6;
  }

  let ctfApproval: boolean | null = null;
  if (/^0x[0-9a-fA-F]{40}$/.test(ctfOperator)) {
    const padOperator = ctfOperator.slice(2).toLowerCase().padStart(64, "0");
    const approvalResult = await ethCall(CONDITIONAL_TOKENS, `0xe985e9c5${padAddr}${padOperator}`);
    ctfApproval = approvalResult === null ? null : BigInt(approvalResult) !== BigInt(0);
  }

  return NextResponse.json(
    { balance, allowance, ctfApproval },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
