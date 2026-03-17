import { NextResponse } from 'next/server'
import { Bond, calcAPY } from '@/lib/bonds'

export const revalidate = 60

const GAMMA = 'https://gamma-api.polymarket.com'
const PAGES = 5
const LIMIT = 200

function parsePrice(m: Record<string, unknown>): number | null {
  try {
    if (m.outcomePrices) {
      const prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices as string) : m.outcomePrices
      return parseFloat((prices as string[])[0])
    }
    for (const key of ['lastTradePrice', 'price', 'bestAsk']) {
      if (m[key] != null) return parseFloat(m[key] as string)
    }
  } catch {}
  return null
}

export async function GET() {
  try {
    const pageUrls: string[] = []
    for (let page = 0; page < PAGES; page++) {
      pageUrls.push(
        `${GAMMA}/markets?closed=false&archived=false&active=true&limit=${LIMIT}&offset=${page * LIMIT}&order=volume24hr&ascending=false`
      )
    }

    const results = await Promise.allSettled(
      pageUrls.map((url) =>
        fetch(url, {
          headers: { 'User-Agent': 'OnlyBonds/1.0' },
          next: { revalidate: 60 },
        }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
      )
    )

    const seen = new Set<string>()
    const bonds: Bond[] = []
    const now = new Date()

    for (const result of results) {
      if (result.status !== 'fulfilled') continue
      const data = result.value
      const page: Record<string, unknown>[] = Array.isArray(data) ? data : (data.markets ?? [])

      for (const m of page) {
        const id = String(m.conditionId || m.id || '')
        if (!id || seen.has(id)) continue
        seen.add(id)

        let statuses: string[] = []
        try {
          const raw = m.umaResolutionStatuses
          statuses = typeof raw === 'string' ? JSON.parse(raw) : (raw as string[]) ?? []
        } catch {}
        if (!statuses.length || statuses[statuses.length - 1] !== 'disputed') continue

        const price = parsePrice(m)
        const endDate = String(m.endDate || m.endDateIso || '')
        if (endDate && !endDate.startsWith('2026-12-31') && new Date(endDate) <= now) continue

        const slug = String(
          (Array.isArray(m.events) && (m.events as any[]).length > 0
            ? (m.events as any[])[0]?.slug
            : null) || m.slug || m.conditionId || ''
        )

        bonds.push({
          id,
          question: String(m.question || m.title || 'Unknown'),
          slug,
          category: 'Disputed',
          price: price ?? 0,
          apy: price && endDate && !endDate.startsWith('2026-12-31') ? calcAPY(price, endDate) : null,
          endDate,
          volume: parseFloat(String(m.volume24hr || m.volumeNum || m.volumeClob || m.volume || 0)),
          liquidity: parseFloat(String(m.liquidityNum || m.liquidityClob || m.liquidity || 0)),
        })
      }
    }

    return NextResponse.json({ disputes: bonds, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Failed to fetch disputes:', err)
    return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 })
  }
}
