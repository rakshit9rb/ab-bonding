// Polymarket CLOB trading integration
import { encodeFunctionData, maxUint256 } from "viem";

export const CLOB_URL = "https://clob.polymarket.com";
const POLYGON_CHAIN_ID = 137;
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

// Contract addresses on Polygon
export const CTF_EXCHANGE = "0xE111180000d2663C0091e4f400237545B87B996B" as const;
export const NEG_RISK_CTF_EXCHANGE = "0xe2222d279d744050d28e00520010520000310F59" as const;
export const CONDITIONAL_TOKENS_ADDRESS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;
export const COLLATERAL_TOKEN_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB" as const; // pUSD on Polygon
export const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const;
export const COLLATERAL_ONRAMP_ADDRESS = "0x93070a847efEf7F70739046A929D47a521F5B8ee" as const;

type Side = "BUY" | "SELL";
export type OrderType = "GTC" | "FOK"; // Good-til-cancelled, Fill-or-kill (market)

export interface OrderBook {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  last_trade_price?: string;
  min_order_size?: string;
  tick_size?: string;
  base_fee?: number;
}

export interface OrderPreview {
  avgPrice: number;
  shares: number;
  totalCost: number; // collateral spent (BUY) or received (SELL)
  potentialReturn: number; // profit if resolves YES (BUY only)
  priceImpact: number; // % slippage from best price
  limitPrice?: number; // worst price touched by a market preview
  fee?: number;
}

// ── BUY preview: spend usdcAmount, walk the ask ladder ──────────────────────
export function calcMarketPreview(book: OrderBook, usdcAmount: number): OrderPreview | null {
  const rawLevels = book.asks;
  if (!rawLevels || rawLevels.length === 0) return null;

  // asks come DESC from API; walk from end (best) upward for BUY
  const levels = [...rawLevels].reverse();

  let remaining = usdcAmount;
  let totalShares = 0;
  let totalSpent = 0;
  let totalFee = 0;
  const bestPrice = parseFloat(levels[0].price);
  let limitPrice = bestPrice;
  const feeRate = Math.max(0, book.base_fee ?? 0) / 10_000;

  for (const lvl of levels) {
    if (remaining <= 0) break;
    const price = parseFloat(lvl.price);
    const size = parseFloat(lvl.size);
    const feePerShare = feeRate * price * (1 - price);
    const totalCostPerShare = price + feePerShare;
    const cost = price * size;
    const costWithFee = totalCostPerShare * size;
    if (costWithFee <= remaining) {
      limitPrice = price;
      totalShares += size;
      totalSpent += cost;
      totalFee += feePerShare * size;
      remaining -= costWithFee;
    } else {
      const partial = remaining / totalCostPerShare;
      limitPrice = price;
      totalShares += partial;
      totalSpent += partial * price;
      totalFee += partial * feePerShare;
      remaining = 0;
    }
  }

  if (totalShares === 0) return null;
  const avgPrice = totalSpent / totalShares;
  const totalCost = totalSpent + totalFee;
  return {
    avgPrice,
    shares: totalShares,
    totalCost,
    potentialReturn: totalShares - totalCost,
    priceImpact: Math.abs((avgPrice - bestPrice) / bestPrice) * 100,
    limitPrice,
    fee: totalFee,
  };
}

// ── SELL preview: sell `shares`, walk the bid ladder ────────────────────────
export function calcSellPreview(book: OrderBook, shares: number): OrderPreview | null {
  const rawLevels = book.bids;
  if (!rawLevels || rawLevels.length === 0) return null;

  // bids come ASC; reverse so best (highest) bid is first
  const levels = [...rawLevels].reverse();
  const bestPrice = parseFloat(levels[0].price);
  let limitPrice = bestPrice;
  const feeRate = Math.max(0, book.base_fee ?? 0) / 10_000;

  let remaining = shares;
  let totalUsdc = 0;
  let totalFilled = 0;
  let totalFee = 0;

  for (const lvl of levels) {
    if (remaining <= 0) break;
    const price = parseFloat(lvl.price);
    const size = parseFloat(lvl.size);
    const take = Math.min(remaining, size);
    limitPrice = price;
    totalFilled += take;
    totalUsdc += take * price;
    totalFee += take * feeRate * price * (1 - price);
    remaining -= take;
  }

  if (totalFilled === 0) return null;
  const avgPrice = totalUsdc / totalFilled;
  const totalReceived = totalUsdc - totalFee;
  return {
    avgPrice,
    shares: totalFilled,
    totalCost: totalReceived, // collateral received
    potentialReturn: totalReceived,
    priceImpact: Math.abs((avgPrice - bestPrice) / bestPrice) * 100,
    limitPrice,
    fee: totalFee,
  };
}

// ── Collateral balance via our proxied API route ─────────────────────────────
export async function getUsdcBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/balance?address=${address}`);
    if (!res.ok) return null;
    const { balance } = await res.json();
    return typeof balance === "number" ? balance : null;
  } catch {
    return null;
  }
}

export async function getUsdceBalance(address: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/balance?address=${address}&asset=usdce`);
    if (!res.ok) return null;
    const { balance } = await res.json();
    return typeof balance === "number" ? balance : null;
  } catch {
    return null;
  }
}

// ── Collateral allowance via proxied API route ───────────────────────────────
export async function getUsdcAllowance(address: string, spender: string): Promise<number> {
  try {
    const res = await fetch(`/api/balance?address=${address}&spender=${spender}`);
    const { allowance } = await res.json();
    return typeof allowance === "number" ? allowance : 0;
  } catch {
    return 0;
  }
}

export async function getUsdceAllowance(address: string, spender: string): Promise<number> {
  try {
    const res = await fetch(`/api/balance?address=${address}&asset=usdce&spender=${spender}`);
    const { allowance } = await res.json();
    return typeof allowance === "number" ? allowance : 0;
  } catch {
    return 0;
  }
}

export async function getCtfApproval(address: string, operator: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/balance?address=${address}&ctfOperator=${operator}`);
    const { ctfApproval } = await res.json();
    return ctfApproval === true;
  } catch {
    return false;
  }
}

type SponsoredTransactionSender = (
  transaction: {
    to: `0x${string}`;
    data: `0x${string}`;
    chainId: number;
  },
  options: {
    sponsor: true;
    address: string;
  },
) => Promise<{ hash: `0x${string}` }>;

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const ERC1155_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const COLLATERAL_ONRAMP_ABI = [
  {
    name: "wrap",
    type: "function",
    inputs: [
      { name: "_asset", type: "address" },
      { name: "_to", type: "address" },
      { name: "_amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

async function approveErc20Sponsored({
  sendTransaction,
  address,
  token,
  spender,
}: {
  sendTransaction: SponsoredTransactionSender;
  address: string;
  token: `0x${string}`;
  spender: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { hash } = await sendTransaction(
      {
        to: token,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "approve",
          args: [spender as `0x${string}`, maxUint256],
        }),
        chainId: POLYGON_CHAIN_ID,
      },
      { sponsor: true, address },
    );
    return { success: true, error: hash };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Approval failed" };
  }
}

// ── Sponsored collateral approval via Privy gas sponsorship ──────────────────
export async function approveUsdcSponsored(
  sendTransaction: SponsoredTransactionSender,
  address: string,
  spender: string,
): Promise<{ success: boolean; error?: string }> {
  return approveErc20Sponsored({
    sendTransaction,
    address,
    token: COLLATERAL_TOKEN_ADDRESS,
    spender,
  });
}

export async function approveUsdceOnrampSponsored(
  sendTransaction: SponsoredTransactionSender,
  address: string,
): Promise<{ success: boolean; error?: string }> {
  return approveErc20Sponsored({
    sendTransaction,
    address,
    token: USDCE_ADDRESS,
    spender: COLLATERAL_ONRAMP_ADDRESS,
  });
}

export async function approveCtfSponsored(
  sendTransaction: SponsoredTransactionSender,
  address: string,
  operator: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { hash } = await sendTransaction(
      {
        to: CONDITIONAL_TOKENS_ADDRESS,
        data: encodeFunctionData({
          abi: ERC1155_ABI,
          functionName: "setApprovalForAll",
          args: [operator as `0x${string}`, true],
        }),
        chainId: POLYGON_CHAIN_ID,
      },
      { sponsor: true, address },
    );
    return { success: true, error: hash };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Approval failed" };
  }
}

export async function wrapUsdceSponsored({
  sendTransaction,
  address,
  amount,
}: {
  sendTransaction: SponsoredTransactionSender;
  address: string;
  amount: bigint;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { hash } = await sendTransaction(
      {
        to: COLLATERAL_ONRAMP_ADDRESS,
        data: encodeFunctionData({
          abi: COLLATERAL_ONRAMP_ABI,
          functionName: "wrap",
          args: [USDCE_ADDRESS, address as `0x${string}`, amount],
        }),
        chainId: POLYGON_CHAIN_ID,
      },
      { sponsor: true, address },
    );
    return { success: true, error: hash };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Wrap failed" };
  }
}

// ── Sponsored collateral transfer via Privy gas sponsorship ──────────────────
export async function transferUsdcSponsored({
  sendTransaction,
  address,
  to,
  amount,
}: {
  sendTransaction: SponsoredTransactionSender;
  address: string;
  to: string;
  amount: bigint;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { hash } = await sendTransaction(
      {
        to: COLLATERAL_TOKEN_ADDRESS,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [to as `0x${string}`, amount],
        }),
        chainId: POLYGON_CHAIN_ID,
      },
      { sponsor: true, address },
    );
    return { success: true, error: hash };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Transaction failed" };
  }
}

// ── EIP-712 order signing for Polymarket CLOB ─────────────────────────────────
const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
    { name: "timestamp", type: "uint256" },
    { name: "metadata", type: "bytes32" },
    { name: "builder", type: "bytes32" },
  ],
} as const;

function getBuilderCode(): `0x${string}` {
  const value = process.env.NEXT_PUBLIC_POLY_BUILDER_CODE;
  return /^0x[0-9a-fA-F]{64}$/.test(value ?? "") ? (value as `0x${string}`) : ZERO_BYTES32;
}

export async function signAndPlaceOrder({
  walletClient,
  address,
  tokenId,
  side,
  orderType,
  price, // 0–1
  size, // shares
  negRisk,
}: {
  walletClient: any;
  address: string;
  tokenId: string;
  side: Side;
  orderType: OrderType;
  price: number;
  size: number;
  negRisk: boolean;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const exchange = negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;
    const salt = BigInt(Math.floor(Math.random() * 1e15));
    const timestamp = BigInt(Date.now());
    const builder = getBuilderCode();
    const sideInt = side === "BUY" ? 0 : 1;

    // BUY:  maker gives collateral, taker gives shares
    // SELL: maker gives shares, taker gives collateral
    const makerAmountRaw =
      side === "BUY"
        ? BigInt(Math.round(price * size * 1_000_000)) // collateral (6 dec)
        : BigInt(Math.round(size * 1_000_000)); // shares (6 dec)
    const takerAmountRaw =
      side === "BUY"
        ? BigInt(Math.round(size * 1_000_000)) // shares
        : BigInt(Math.round(price * size * 1_000_000)); // collateral received

    const orderMessage = {
      salt,
      maker: address as `0x${string}`,
      signer: address as `0x${string}`,
      tokenId: BigInt(tokenId),
      makerAmount: makerAmountRaw,
      takerAmount: takerAmountRaw,
      side: sideInt,
      signatureType: 0,
      timestamp,
      metadata: ZERO_BYTES32,
      builder,
    };

    const signature = await walletClient.signTypedData({
      account: address as `0x${string}`,
      domain: {
        name: "Polymarket CTF Exchange",
        version: "2",
        chainId: POLYGON_CHAIN_ID,
        verifyingContract: exchange,
      },
      types: ORDER_TYPES,
      primaryType: "Order",
      message: orderMessage,
    });

    const bodyObj = {
      order: {
        salt: Number(salt),
        maker: address,
        signer: address,
        tokenId,
        makerAmount: makerAmountRaw.toString(),
        takerAmount: takerAmountRaw.toString(),
        expiration: "0",
        side,
        signatureType: 0,
        timestamp: timestamp.toString(),
        metadata: ZERO_BYTES32,
        builder,
        signature,
      },
      owner: address,
      orderType: orderType === "FOK" ? "FOK" : "GTC",
      deferExec: false,
      postOnly: false,
    };

    const bodyStr = JSON.stringify(bodyObj);
    const res = await fetch("/api/clob/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: bodyStr,
    });

    const data = await res.json();
    if (!res.ok)
      return {
        success: false,
        error: data.error ?? data.message ?? "Order failed",
      };
    if (data.success === false)
      return {
        success: false,
        error: data.errorMsg || data.error || "Order rejected",
      };
    return { success: true, orderId: data.orderID };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Unknown error" };
  }
}
