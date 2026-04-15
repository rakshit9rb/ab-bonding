import { NextRequest, NextResponse } from 'next/server'

const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
// Public Polygon RPC — more reliable than demo Alchemy key
const RPCS = [
  'https://polygon-rpc.com',
  'https://rpc.ankr.com/polygon',
  'https://1rpc.io/matic',
]

async function ethCall(to: string, data: string): Promise<string> {
  for (const rpc of RPCS) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
        signal: AbortSignal.timeout(5000),
      })
      const json = await res.json()
      if (json.result && json.result !== '0x') return json.result as string
    } catch { /* try next */ }
  }
  return '0x0'
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address') ?? ''
  const spender  = req.nextUrl.searchParams.get('spender')  ?? ''

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ balance: 0, allowance: null })
  }

  const padAddr = address.slice(2).toLowerCase().padStart(64, '0')

  // balanceOf(address)
  const balResult = await ethCall(USDC, `0x70a08231${padAddr}`)
  const balance = parseInt(balResult, 16) / 1e6

  // allowance(owner, spender) — optional
  let allowance: number | null = null
  if (/^0x[0-9a-fA-F]{40}$/.test(spender)) {
    const padSpender = spender.slice(2).toLowerCase().padStart(64, '0')
    const allowResult = await ethCall(USDC, `0xdd62ed3e${padAddr}${padSpender}`)
    allowance = parseInt(allowResult, 16) / 1e6
  }

  return NextResponse.json({ balance, allowance }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
