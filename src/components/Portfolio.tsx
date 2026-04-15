'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { getUsdcBalance } from '@/lib/polymarket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Position {
  asset: string
  conditionId: string
  title: string
  outcome: string
  slug: string
  eventSlug: string
  size: number
  avgPrice: number
  curPrice: number
  currentValue: number
  cashPnl: number
  percentPnl: number
  initialValue: number
  totalBought: number
  redeemable: boolean
  endDate: string
}

interface Activity {
  id: string
  timestamp: number
  title: string
  slug: string
  outcome: string
  side: string      // 'BUY' | 'SELL'
  size: number
  price: number
  usdcSize: number
  type: string
  outcome_index?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return '$' + n.toFixed(2)
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function PnlBadge({ value, pct }: { value: number; pct?: number }) {
  const pos = value >= 0
  return (
    <span className="font-mono font-semibold" style={{ color: pos ? '#4ade80' : '#f87171' }}>
      {fmt$(value)}{pct != null ? ` (${fmtPct(pct)})` : ''}
    </span>
  )
}

// ─── Summary Bar ─────────────────────────────────────────────────────────────

function SummaryBar({ positions, usdcBalance, address }: { positions: Position[]; usdcBalance: number | null; address: string }) {
  const totalInvested = positions.reduce((s, p) => s + p.totalBought, 0)
  const totalValue = positions.reduce((s, p) => s + p.currentValue, 0)
  const totalPnl = positions.reduce((s, p) => s + p.cashPnl, 0)
  const open = positions.filter(p => !p.redeemable).length

  const stats = [
    { label: 'USDC Balance', value: usdcBalance != null ? fmt$(usdcBalance) : '—', color: 'var(--text)' },
    { label: 'Invested', value: fmt$(totalInvested), color: 'var(--text)' },
    { label: 'Current Value', value: fmt$(totalValue), color: 'var(--text)' },
    { label: 'Total PnL', value: fmt$(totalPnl), color: totalPnl >= 0 ? '#4ade80' : '#f87171' },
    { label: 'Open Positions', value: String(open), color: 'var(--text)' },
  ]

  return (
    <div className="rounded-xl p-5 mb-6 flex flex-wrap gap-6 items-center justify-between" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
      <div className="flex flex-wrap gap-8">
        {stats.map(s => (
          <div key={s.label}>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#6b7280' }}>{s.label}</div>
            <div className="text-[22px] font-bold font-mono leading-none" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[12px] font-mono hidden md:block" style={{ color: '#4b5563' }}>
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <a
          href="https://polymarket.com/wallet?via=onlybonds"
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-2 rounded-lg text-[13px] font-semibold transition-all"
          style={{ background: 'rgba(5,150,80,0.15)', border: '1px solid rgba(5,150,80,0.3)', color: '#4ade80', textDecoration: 'none' }}
        >
          Deposit on Polymarket →
        </a>
      </div>
    </div>
  )
}

// ─── Positions Table ──────────────────────────────────────────────────────────

function PositionsTable({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <span className="text-[16px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No open positions</span>
        <span className="text-[14px]" style={{ color: 'var(--text-tertiary)' }}>Your Polymarket positions will appear here</span>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6b7280', borderBottom: '1px solid #1f2937' }}>
            <th className="text-left pb-3 pr-4">Market</th>
            <th className="text-right pb-3 px-3">Outcome</th>
            <th className="text-right pb-3 px-3">Shares</th>
            <th className="text-right pb-3 px-3">Avg Price</th>
            <th className="text-right pb-3 px-3">Cur Price</th>
            <th className="text-right pb-3 px-3">Value</th>
            <th className="text-right pb-3 px-3">PnL</th>
            <th className="text-right pb-3 pl-3">Expiry</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => (
            <tr key={p.asset} style={{ borderBottom: '1px solid #1f2937', opacity: p.redeemable ? 0.6 : 1 }}>
              <td className="py-3 pr-4">
                <a
                  href={`https://polymarket.com/event/${p.eventSlug}?via=onlybonds`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-[13px] font-medium hover:underline"
                  style={{ color: 'var(--text)', textDecoration: 'none' }}
                >
                  <span className="line-clamp-2 max-w-[280px] block">{p.title}</span>
                </a>
                {p.redeemable && <span className="text-[11px] mt-0.5 block" style={{ color: '#fbbf24' }}>Redeemable</span>}
              </td>
              <td className="py-3 px-3 text-right">
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{
                  background: p.outcome.toLowerCase() === 'yes' || p.curPrice > 0.5 ? 'rgba(5,150,80,0.15)' : 'rgba(220,38,38,0.1)',
                  color: p.outcome.toLowerCase() === 'yes' || p.curPrice > 0.5 ? '#4ade80' : '#f87171',
                }}>{p.outcome}</span>
              </td>
              <td className="py-3 px-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{p.size.toFixed(2)}</td>
              <td className="py-3 px-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{p.avgPrice > 0 ? (p.avgPrice * 100).toFixed(1) + '¢' : '—'}</td>
              <td className="py-3 px-3 text-right font-mono" style={{ color: 'var(--text)' }}>{(p.curPrice * 100).toFixed(1)}¢</td>
              <td className="py-3 px-3 text-right font-mono" style={{ color: 'var(--text)' }}>{fmt$(p.currentValue)}</td>
              <td className="py-3 px-3 text-right"><PnlBadge value={p.cashPnl} pct={p.percentPnl} /></td>
              <td className="py-3 pl-3 text-right font-mono text-[12px]" style={{ color: '#6b7280' }}>
                {p.endDate ? new Date(p.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Activity Table ───────────────────────────────────────────────────────────

function ActivityTable({ address }: { address: string }) {
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (off: number, append = false) => {
    setLoading(true)
    try {
      const res = await fetch(`https://data-api.polymarket.com/activity?user=${address}&limit=${LIMIT}&offset=${off}`)
      const data: Activity[] = await res.json()
      if (append) setActivity(prev => [...prev, ...data])
      else setActivity(data)
      setHasMore(data.length === LIMIT)
      setOffset(off + data.length)
    } catch {
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => { load(0) }, [load])

  if (loading && activity.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="text-[14px]" style={{ color: '#6b7280' }}>Loading history…</span>
      </div>
    )
  }

  if (!loading && activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <span className="text-[16px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No trade history</span>
        <span className="text-[14px]" style={{ color: 'var(--text-tertiary)' }}>Trades will appear here after you place orders</span>
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6b7280', borderBottom: '1px solid #1f2937' }}>
              <th className="text-left pb-3 pr-4">Date</th>
              <th className="text-left pb-3 pr-4">Market</th>
              <th className="text-right pb-3 px-3">Side</th>
              <th className="text-right pb-3 px-3">Outcome</th>
              <th className="text-right pb-3 px-3">Shares</th>
              <th className="text-right pb-3 px-3">Price</th>
              <th className="text-right pb-3 pl-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a, i) => {
              const isBuy = a.side?.toUpperCase() === 'BUY'
              const isWon = a.type === 'REDEEM' || a.outcome?.toLowerCase() === 'won'
              const isLost = a.outcome?.toLowerCase() === 'lost'
              return (
                <tr key={a.id ?? i} style={{ borderBottom: '1px solid #1f2937' }}>
                  <td className="py-3 pr-4 font-mono text-[12px] whitespace-nowrap" style={{ color: '#6b7280' }}>
                    {a.timestamp ? fmtDate(a.timestamp) : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="line-clamp-1 max-w-[240px] block" style={{ color: 'var(--text)' }}>{a.title ?? '—'}</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{
                      background: isBuy ? 'rgba(5,150,80,0.15)' : 'rgba(220,38,38,0.1)',
                      color: isBuy ? '#4ade80' : '#f87171',
                    }}>{a.side ?? a.type ?? '—'}</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {isWon ? <span style={{ color: '#4ade80' }} className="font-semibold text-[12px]">Won ✓</span>
                    : isLost ? <span style={{ color: '#f87171' }} className="font-semibold text-[12px]">Lost ✗</span>
                    : <span style={{ color: '#9ca3af' }} className="text-[12px]">{a.outcome ?? '—'}</span>}
                  </td>
                  <td className="py-3 px-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{a.size?.toFixed(2) ?? '—'}</td>
                  <td className="py-3 px-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{a.price != null ? (a.price * 100).toFixed(1) + '¢' : '—'}</td>
                  <td className="py-3 pl-3 text-right font-mono font-semibold" style={{ color: 'var(--text)' }}>{a.usdcSize != null ? fmt$(a.usdcSize) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => load(offset, true)}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-all disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #1f2937', color: '#9ca3af' }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'positions' | 'history'

export default function Portfolio() {
  const { ready, authenticated, login } = usePrivy()
  const { wallets } = useWallets()

  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(false)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('positions')
  const [proxyInput, setProxyInput] = useState('')
  const [proxyAddress, setProxyAddress] = useState('')

  const wallet = wallets[0]
  const address = wallet?.address
  // Use proxy wallet if set, otherwise fall back to connected address
  const queryAddress = proxyAddress || address

  useEffect(() => {
    if (!queryAddress) return
    setLoading(true)
    fetch(`https://data-api.polymarket.com/positions?user=${queryAddress.toLowerCase()}`)
      .then(r => r.json())
      .then((data: Position[]) => setPositions(Array.isArray(data) ? data : []))
      .catch(() => setPositions([]))
      .finally(() => setLoading(false))

    getUsdcBalance(queryAddress).then(setUsdcBalance)
  }, [queryAddress])

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-4 md:px-8 h-14 md:h-16">
          <div className="flex items-center gap-4 md:gap-6">
            <a href="/" className="flex items-center gap-2 no-underline">
              <img src="/light.svg" alt="OnlyBonds" className="h-5 md:h-7 dark:hidden" />
              <img src="/dark.svg" alt="OnlyBonds" className="h-5 md:h-7 hidden dark:block" />
            </a>
            <a href="/portfolio" className="text-[14px] font-semibold" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Portfolio</a>
          </div>
          {authenticated && address && (
            <span className="text-[12px] font-mono hidden md:block" style={{ color: 'var(--text-tertiary)' }}>
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          )}
        </div>
      </nav>

      <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-8 md:pt-12 pb-16">

        <h1 className="text-[28px] md:text-[40px] font-bold tracking-[-0.02em] mb-2" style={{ color: 'var(--accent)' }}>Portfolio</h1>
        <p className="text-[15px] mb-8" style={{ color: 'var(--text-secondary)' }}>Your Polymarket positions and trade history.</p>

        {!ready ? null : !authenticated ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 rounded-2xl" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
            <p className="text-[16px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Connect your wallet to view your portfolio</p>
            <button
              onClick={login}
              className="px-6 py-3 rounded-xl font-semibold text-[15px] cursor-pointer transition-all hover:opacity-90"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <>
            <SummaryBar positions={positions} usdcBalance={usdcBalance} address={queryAddress ?? ''} />

            {/* Proxy wallet resolver — shown when no positions found */}
            {!loading && positions.length === 0 && (
              <div className="mb-6 p-4 rounded-xl" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
                <p className="text-[13px] mb-3" style={{ color: '#9ca3af' }}>
                  No positions found for your connected address. Polymarket uses a separate <strong style={{ color: '#e5e7eb' }}>proxy wallet</strong> — find yours at{' '}
                  <a href="https://polymarket.com/profile" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>polymarket.com/profile</a>
                  {' '}(copy the address from the URL).
                </p>
                <div className="flex gap-2">
                  <input
                    value={proxyInput}
                    onChange={e => setProxyInput(e.target.value)}
                    placeholder="0x... (your Polymarket proxy wallet)"
                    className="flex-1 px-3 py-2 rounded-lg text-[13px] font-mono outline-none"
                    style={{ background: '#0d1117', border: '1px solid #374151', color: '#e5e7eb' }}
                  />
                  <button
                    onClick={() => proxyInput.startsWith('0x') && setProxyAddress(proxyInput.trim())}
                    className="px-4 py-2 rounded-lg text-[13px] font-semibold cursor-pointer"
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
                  >
                    Load
                  </button>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-6 mb-6" style={{ borderBottom: '1px solid #1f2937' }}>
              {([{ v: 'positions', l: 'Positions' }, { v: 'history', l: 'Trade History' }] as { v: Tab; l: string }[]).map(t => (
                <button
                  key={t.v}
                  onClick={() => setTab(t.v)}
                  className="pb-3 text-[14px] font-semibold cursor-pointer transition-colors"
                  style={{
                    background: 'none', border: 'none', padding: '0 0 12px',
                    color: tab === t.v ? 'var(--text)' : 'var(--text-tertiary)',
                    borderBottom: tab === t.v ? '2px solid var(--accent)' : '2px solid transparent',
                    marginBottom: '-1px',
                  }}
                >
                  {t.l}{t.v === 'positions' ? ` (${positions.length})` : ''}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="rounded-xl p-5" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
              {tab === 'positions' ? (
                loading ? (
                  <div className="flex items-center justify-center h-32">
                    <span className="text-[14px]" style={{ color: '#6b7280' }}>Loading positions…</span>
                  </div>
                ) : (
                  <PositionsTable positions={positions} />
                )
              ) : (
                queryAddress && <ActivityTable address={queryAddress.toLowerCase()} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
