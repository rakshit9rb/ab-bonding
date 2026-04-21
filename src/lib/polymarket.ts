// Polymarket CLOB trading integration

export const CLOB_URL = "https://clob.polymarket.com";
const POLYGON_CHAIN_ID = 137;

// Contract addresses on Polygon
export const CTF_EXCHANGE =
  "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as const;
export const NEG_RISK_CTF_EXCHANGE =
  "0xC5d563A36AE78145C45a50134d48A1215220f80a" as const;
export const USDC_ADDRESS =
  "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174" as const; // USDC.e on Polygon

type Side = "BUY" | "SELL";
export type OrderType = "GTC" | "FOK"; // Good-til-cancelled, Fill-or-kill (market)

export interface OrderBook {
  bids: { price: string; size: string }[];
  asks: { price: string; size: string }[];
  last_trade_price?: string;
  min_order_size?: string;
  tick_size?: string;
}

export interface OrderPreview {
  avgPrice: number;
  shares: number;
  totalCost: number; // USDC spent (BUY) or received (SELL)
  potentialReturn: number; // profit if resolves YES (BUY only)
  priceImpact: number; // % slippage from best price
}

// ── BUY preview: spend usdcAmount, walk the ask ladder ──────────────────────
export function calcMarketPreview(
  book: OrderBook,
  usdcAmount: number,
  side: "YES" | "NO",
): OrderPreview | null {
  // Buying YES → take asks on YES token (ASC price, worst first DESC from API — reversed here)
  // Buying NO  → take bids on YES token inverted
  const rawLevels = side === "YES" ? book.asks : book.bids;
  if (!rawLevels || rawLevels.length === 0) return null;

  // asks come DESC from API; walk from end (best) upward for BUY
  const levels = side === "YES" ? [...rawLevels].reverse() : rawLevels;

  let remaining = usdcAmount;
  let totalShares = 0;
  let totalSpent = 0;
  const bestPrice = parseFloat(levels[0].price);

  for (const lvl of levels) {
    if (remaining <= 0) break;
    const price = parseFloat(lvl.price);
    const size = parseFloat(lvl.size);
    const cost = price * size;
    if (cost <= remaining) {
      totalShares += size;
      totalSpent += cost;
      remaining -= cost;
    } else {
      const partial = remaining / price;
      totalShares += partial;
      totalSpent += remaining;
      remaining = 0;
    }
  }

  if (totalShares === 0) return null;
  const avgPrice = totalSpent / totalShares;
  return {
    avgPrice,
    shares: totalShares,
    totalCost: totalSpent,
    potentialReturn: totalShares - totalSpent,
    priceImpact: Math.abs((avgPrice - bestPrice) / bestPrice) * 100,
  };
}

// ── SELL preview: sell `shares`, walk the bid ladder ────────────────────────
export function calcSellPreview(
  book: OrderBook,
  shares: number,
  side: "YES" | "NO",
): OrderPreview | null {
  // Selling YES → take bids on YES token (ASC from API; best bid = last element)
  // Selling NO  → equivalent to buying YES; take asks inverted
  const rawLevels = side === "YES" ? book.bids : book.asks;
  if (!rawLevels || rawLevels.length === 0) return null;

  // bids come ASC; reverse so best (highest) bid is first
  const levels = side === "YES" ? [...rawLevels].reverse() : rawLevels;
  const bestPrice = parseFloat(levels[0].price);

  let remaining = shares;
  let totalUsdc = 0;
  let totalFilled = 0;

  for (const lvl of levels) {
    if (remaining <= 0) break;
    const price = parseFloat(lvl.price);
    const size = parseFloat(lvl.size);
    const take = Math.min(remaining, size);
    totalFilled += take;
    totalUsdc += take * price;
    remaining -= take;
  }

  if (totalFilled === 0) return null;
  const avgPrice = totalUsdc / totalFilled;
  return {
    avgPrice,
    shares: totalFilled,
    totalCost: totalUsdc, // USDC received
    potentialReturn: totalUsdc,
    priceImpact: Math.abs((avgPrice - bestPrice) / bestPrice) * 100,
  };
}

// ── USDC balance via our proxied API route ───────────────────────────────────
export async function getUsdcBalance(address: string): Promise<number> {
  try {
    const res = await fetch(`/api/balance?address=${address}`);
    const { balance } = await res.json();
    return typeof balance === "number" ? balance : 0;
  } catch {
    return 0;
  }
}

// ── USDC allowance via proxied API route ─────────────────────────────────────
export async function getUsdcAllowance(
  address: string,
  spender: string,
): Promise<number> {
  try {
    const res = await fetch(
      `/api/balance?address=${address}&spender=${spender}`,
    );
    const { allowance } = await res.json();
    return typeof allowance === "number" ? allowance : 0;
  } catch {
    return 0;
  }
}

// ── Approve USDC for exchange (max approval) ──────────────────────────────────
export async function approveUsdc(
  walletClient: any,
  address: string,
  spender: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const spenderPad = spender.slice(2).toLowerCase().padStart(64, "0");
    const maxVal = "f".repeat(64);
    const hash = await walletClient.sendTransaction({
      account: address as `0x${string}`,
      to: USDC_ADDRESS,
      data: `0x095ea7b3${spenderPad}${maxVal}` as `0x${string}`,
    });
    return { success: true, error: hash };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Approval failed" };
  }
}

// ── EIP-712 order signing for Polymarket CLOB ─────────────────────────────────
const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

export async function signAndPlaceOrder({
  walletClient,
  address,
  tokenId,
  side,
  orderType,
  price, // 0–1
  size, // shares
  negRisk,
  l2Headers,
}: {
  walletClient: any;
  address: string;
  tokenId: string;
  side: Side;
  orderType: OrderType;
  price: number;
  size: number;
  negRisk: boolean;
  l2Headers?: Record<string, string>;
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const exchange = negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;
    const salt = BigInt(Math.floor(Math.random() * 1e15));
    const sideInt = side === "BUY" ? 0 : 1;

    // BUY:  maker gives USDC, taker gives shares
    // SELL: maker gives shares, taker gives USDC
    const makerAmountRaw =
      side === "BUY"
        ? BigInt(Math.round(price * size * 1_000_000)) // USDC (6 dec)
        : BigInt(Math.round(size * 1_000_000)); // shares (6 dec)
    const takerAmountRaw =
      side === "BUY"
        ? BigInt(Math.round(size * 1_000_000)) // shares
        : BigInt(Math.round(price * size * 1_000_000)); // USDC received

    const orderMessage = {
      salt,
      maker: address as `0x${string}`,
      signer: address as `0x${string}`,
      taker: "0x0000000000000000000000000000000000000000" as `0x${string}`,
      tokenId: BigInt(tokenId),
      makerAmount: makerAmountRaw,
      takerAmount: takerAmountRaw,
      expiration: BigInt(0),
      nonce: BigInt(0),
      feeRateBps: BigInt(0),
      side: sideInt,
      signatureType: 0,
    };

    const signature = await walletClient.signTypedData({
      account: address as `0x${string}`,
      domain: {
        name: "Polymarket CTF Exchange",
        version: "1",
        chainId: POLYGON_CHAIN_ID,
        verifyingContract: exchange,
      },
      types: ORDER_TYPES,
      primaryType: "Order",
      message: orderMessage,
    });

    const bodyObj = {
      order: {
        salt: salt.toString(),
        maker: address,
        signer: address,
        taker: "0x0000000000000000000000000000000000000000",
        tokenId,
        makerAmount: makerAmountRaw.toString(),
        takerAmount: takerAmountRaw.toString(),
        expiration: "0",
        nonce: "0",
        feeRateBps: "0",
        side: sideInt,
        signatureType: 0,
        signature,
      },
      owner: address,
      orderType: orderType === "FOK" ? "FOK" : "GTC",
    };

    const bodyStr = JSON.stringify(bodyObj);
    const res = await fetch(`${CLOB_URL}/order`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...l2Headers,
      },
      body: bodyStr,
    });

    const data = await res.json();
    if (!res.ok)
      return {
        success: false,
        error: data.error ?? data.message ?? "Order failed",
      };
    return { success: true, orderId: data.orderID };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Unknown error" };
  }
}
