// Polymarket CLOB trading integration

export const CLOB_URL = 'https://clob.polymarket.com'
export const POLYGON_CHAIN_ID = 137

// Contract addresses on Polygon
export const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as const
export const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a' as const
export const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const // USDC.e on Polygon

export type Side = 'BUY' | 'SELL'
export type OrderType = 'GTC' | 'FOK' // Good-til-cancelled, Fill-or-kill (market)

export interface OrderBook {
  bids: { price: string; size: string }[]
  asks: { price: string; size: string }[]
}

export interface OrderPreview {
  avgPrice: number
  shares: number
  totalCost: number
  potentialReturn: number  // profit if resolves YES
  priceImpact: number      // % slippage from best price
}

// Calculate what you'd get from a market BUY order
export function calcMarketPreview(
  book: OrderBook,
  usdcAmount: number,
  side: 'YES' | 'NO'
): OrderPreview | null {
  // Buying YES = taking asks on YES token
  // Buying NO = taking asks on NO token (price = 1 - YES price)
  const levels = side === 'YES' ? book.asks : book.bids
  if (!levels || levels.length === 0) return null

  let remaining = usdcAmount
  let totalShares = 0
  let totalSpent = 0
  const bestPrice = parseFloat(levels[0].price)

  for (const level of levels) {
    const price = parseFloat(level.price)
    const size = parseFloat(level.size)
    const levelCost = price * size

    if (remaining <= 0) break

    if (levelCost <= remaining) {
      totalShares += size
      totalSpent += levelCost
      remaining -= levelCost
    } else {
      const partialShares = remaining / price
      totalShares += partialShares
      totalSpent += remaining
      remaining = 0
    }
  }

  if (totalShares === 0) return null

  const avgPrice = totalSpent / totalShares
  return {
    avgPrice,
    shares: totalShares,
    totalCost: totalSpent,
    potentialReturn: totalShares - totalSpent, // profit = shares - cost (shares resolve to $1)
    priceImpact: Math.abs((avgPrice - bestPrice) / bestPrice) * 100,
  }
}

// EIP-712 order signing for Polymarket CLOB
const ORDER_TYPES = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'maker', type: 'address' },
    { name: 'signer', type: 'address' },
    { name: 'taker', type: 'address' },
    { name: 'tokenId', type: 'uint256' },
    { name: 'makerAmount', type: 'uint256' },
    { name: 'takerAmount', type: 'uint256' },
    { name: 'expiration', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'feeRateBps', type: 'uint256' },
    { name: 'side', type: 'uint8' },
    { name: 'signatureType', type: 'uint8' },
  ],
} as const

export async function signAndPlaceOrder({
  walletClient,
  address,
  tokenId,
  side,
  orderType,
  price,       // 0-1 (probability)
  size,        // number of shares
  negRisk,
}: {
  walletClient: any
  address: string
  tokenId: string
  side: Side
  orderType: OrderType
  price: number
  size: number
  negRisk: boolean
}): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const exchange = negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE
    const salt = BigInt(Math.floor(Math.random() * 1e15))
    const sideInt = side === 'BUY' ? 0 : 1

    // Amounts in USDC 6 decimals
    const DECIMALS = 1_000_000n
    const makerAmountRaw = BigInt(Math.round(price * size * 1_000_000)) // USDC spent
    const takerAmountRaw = BigInt(Math.round(size * 1_000_000))          // shares received

    const orderMessage = {
      salt,
      maker: address as `0x${string}`,
      signer: address as `0x${string}`,
      taker: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      tokenId: BigInt(tokenId),
      makerAmount: makerAmountRaw,
      takerAmount: takerAmountRaw,
      expiration: 0n,
      nonce: 0n,
      feeRateBps: 0n,
      side: sideInt,
      signatureType: 0, // EOA
    }

    const signature = await walletClient.signTypedData({
      account: address as `0x${string}`,
      domain: {
        name: 'Polymarket CTF Exchange',
        version: '1',
        chainId: POLYGON_CHAIN_ID,
        verifyingContract: exchange,
      },
      types: ORDER_TYPES,
      primaryType: 'Order',
      message: orderMessage,
    })

    const body = {
      order: {
        salt: salt.toString(),
        maker: address,
        signer: address,
        taker: '0x0000000000000000000000000000000000000000',
        tokenId,
        makerAmount: makerAmountRaw.toString(),
        takerAmount: takerAmountRaw.toString(),
        expiration: '0',
        nonce: '0',
        feeRateBps: '0',
        side: sideInt,
        signatureType: 0,
        signature,
      },
      owner: address,
      orderType: orderType === 'FOK' ? 'FOK' : 'GTC',
    }

    const res = await fetch(`${CLOB_URL}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    if (!res.ok) return { success: false, error: data.error ?? 'Order failed' }
    return { success: true, orderId: data.orderID }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Unknown error' }
  }
}

// Fetch USDC balance on Polygon for an address
export async function getUsdcBalance(address: string): Promise<number> {
  try {
    const res = await fetch(
      `https://polygon-mainnet.g.alchemy.com/v2/demo`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: USDC_ADDRESS,
            data: `0x70a08231000000000000000000000000${address.slice(2).toLowerCase().padStart(64, '0')}`,
          }, 'latest'],
          id: 1,
        }),
      }
    )
    const data = await res.json()
    const hex = data.result as string
    return parseInt(hex, 16) / 1_000_000 // USDC has 6 decimals
  } catch {
    return 0
  }
}
