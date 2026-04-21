import { NextResponse } from 'next/server'
import { getPostHogServer } from '@/lib/posthogServer'

const events = new Set([
  'trade_submit_clicked',
  'trade_succeeded',
  'trade_failed',
  'network_switch_attempted',
  'network_switch_failed',
  'usdc_approval_started',
  'usdc_approval_succeeded',
  'usdc_approval_failed',
])

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const event = typeof body.event === 'string' ? body.event : ''
    const distinctId = typeof body.distinctId === 'string' ? body.distinctId : ''
    const properties = typeof body.properties === 'object' && body.properties ? body.properties : {}
    if (!events.has(event) || !distinctId) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    const posthog = getPostHogServer()
    if (!posthog) return NextResponse.json({ ok: true, skipped: true })
    posthog.capture({ distinctId, event, properties })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
