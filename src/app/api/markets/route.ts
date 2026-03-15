import { NextResponse } from 'next/server'
import { fetchBonds } from '@/lib/bonds'

export const revalidate = 60 // ISR every 60s

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const minProb = parseFloat(searchParams.get('minProb') ?? '0.95')

  try {
    const bonds = await fetchBonds(minProb)
    return NextResponse.json({ bonds, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Failed to fetch bonds:', err)
    return NextResponse.json({ error: 'Failed to fetch markets' }, { status: 500 })
  }
}
