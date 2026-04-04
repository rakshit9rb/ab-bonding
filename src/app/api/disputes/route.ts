import { NextResponse } from 'next/server'
import { fetchDisputedBonds } from '@/lib/bond-data'

export const revalidate = 60

export async function GET() {
  try {
    const bonds = await fetchDisputedBonds()
    return NextResponse.json({ disputes: bonds, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Failed to fetch disputes:', err)
    return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 })
  }
}
