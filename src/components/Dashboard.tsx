'use client'
import { useState, useEffect, useCallback } from 'react'
import { Bond, TimeFilter, SortKey, applyFilters, getCategories, fmtAPY, fmtVolume } from '@/lib/bonds'
import BondRow from './BondRow'

const CAT_COLORS: Record<string, string> = {
  Crypto:        '#fbbf24',
  Politics:      '#60a5fa',
  Finance:       '#4ade80',
  Sports:        '#c084fc',
  Technology:    '#22d3ee',
  Science:       '#34d399',
  Weather:       '#38bdf8',
  Entertainment: '#f472b6',
  Other:         '#9ca3af',
}

function Pill({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer"
      style={{
        border: active ? '1.5px solid #e5e7eb' : '1.5px solid transparent',
        background: active ? '#f9fafb' : 'transparent',
        color: active ? '#111827' : '#6b7280',
      }}>
      {color && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? '#374151' : color }} />}
      {label}
    </button>
  )
}

export default function Dashboard() {
  const [allBonds, setAllBonds] = useState<Bond[]>([])
  const [fetchedAt, setFetchedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [catFilter, setCatFilter] = useState('all')
  const [sort, setSort] = useState<SortKey>('apy')
  const [minProb, setMinProb] = useState(0.95)
  const [disputes, setDisputes] = useState<Bond[]>([])
  const [showDisputes, setShowDisputes] = useState(false)

  const loadDisputes = useCallback(async () => {
    try {
      const res = await fetch('/api/disputes')
      if (!res.ok) return
      const data = await res.json()
      setDisputes(data.disputes ?? [])
    } catch {}
  }, [])

  const load = useCallback(async (prob = minProb) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/markets?minProb=${prob}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAllBonds(data.bonds ?? [])
      setFetchedAt(new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setError('Could not fetch markets.')
    } finally {
      setLoading(false)
    }
  }, [minProb])

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [load])
  useEffect(() => { loadDisputes(); const id = setInterval(loadDisputes, 60000); return () => clearInterval(id) }, [loadDisputes])

  const categories = getCategories(allBonds)
  const displayed = applyFilters(allBonds, timeFilter, catFilter, sort)
  const apys = allBonds.map(b => b.apy).filter((a): a is number => a !== null && a < 9999)
  const avgAPY = apys.length ? apys.reduce((a, b) => a + b, 0) / apys.length : null
  const bestAPY = apys.length ? Math.max(...apys) : null
  const todayCount = allBonds.filter(b => new Date(b.endDate).toDateString() === new Date().toDateString()).length

  const TIME_OPTS: { value: TimeFilter; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'hours', label: '≤ 24h' },
    { value: 'today', label: 'Today' }, { value: 'week', label: 'This Week' }, { value: 'month', label: 'This Month' },
  ]
  const SORT_OPTS = [
    { value: 'apy', label: 'APY' }, { value: 'prob', label: 'Probability' },
    { value: 'expiry', label: 'Expiry' }, { value: 'volume', label: 'Volume' },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#0d1117', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Nav */}
      <nav className="sticky top-0 z-20 flex items-center justify-between px-6 h-[52px] border-b" style={{ background: '#0d1117', borderColor: '#1f2937' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-bold tracking-tight text-white">OnlyBonds</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)' }}>YES ≥ {(minProb * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-3">
          {!loading && <span className="text-[12px]" style={{ color: '#4b5563' }}>Updated {fetchedAt}</span>}
          <button onClick={() => load()} disabled={loading} className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ border: '1px solid #1f2937', background: '#161b22', color: '#9ca3af', cursor: 'pointer' }}>
            <span style={{ display: 'inline-block', animation: loading ? 'spin 0.9s linear infinite' : 'none' }}>↻</span>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </nav>

      <div className="max-w-[1080px] mx-auto px-5 py-5">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2.5 mb-4">
          {(showDisputes ? [
            { l: 'Disputed',       v: disputes.length,                                                                      c: '#f87171' },
            { l: 'Avg APY',        v: fmtAPY(disputes.map(b => b.apy).filter((a): a is number => a !== null && a < 9999).reduce((a,b,_,arr) => a + b/arr.length, 0) || null), c: '#4ade80' },
            { l: 'Best APY',       v: fmtAPY(disputes.map(b => b.apy).filter((a): a is number => a !== null && a < 9999).reduce((a,b) => Math.max(a,b), 0) || null),           c: '#fbbf24' },
            { l: 'Expiring Today', v: disputes.filter(b => new Date(b.endDate).toDateString() === new Date().toDateString()).length, c: todayCount > 0 ? '#f87171' : '#4b5563' },
          ] : [
            { l: 'Markets',        v: loading ? '—' : allBonds.length, c: '#f9fafb' },
            { l: 'Avg APY',        v: loading ? '—' : fmtAPY(avgAPY),  c: '#4ade80' },
            { l: 'Best APY',       v: loading ? '—' : fmtAPY(bestAPY), c: '#fbbf24' },
            { l: 'Expiring Today', v: loading ? '—' : todayCount,      c: todayCount > 0 ? '#f87171' : '#4b5563' },
          ]).map(s => (
            <div key={s.l} className="rounded-xl p-4" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#4b5563' }}>{s.l}</div>
              <div className="text-[22px] font-bold leading-none" style={{ color: s.c, letterSpacing: '-0.02em' }}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Table card */}
        {!showDisputes && <div className="rounded-xl overflow-hidden" style={{ background: '#161b22', border: '1px solid #1f2937' }}>

          {/* Filters row 1: threshold + time + sort */}
          <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #1f2937' }}>
            <div className="flex gap-0.5 rounded-full p-1" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
              {[0.90, 0.95, 0.97, 0.99].map(p => (
                <Pill key={p} label={`≥${(p * 100).toFixed(0)}%`} active={minProb === p} onClick={() => { setMinProb(p); load(p) }} />
              ))}
            </div>
            <div className="w-px h-5 mx-1" style={{ background: '#1f2937' }} />
            <div className="flex gap-0.5 rounded-full p-1" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
              {TIME_OPTS.map(o => <Pill key={o.value} label={o.label} active={timeFilter === o.value} onClick={() => setTimeFilter(o.value)} />)}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-medium" style={{ color: '#4b5563' }}>Sort by</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
                className="text-[12px] font-medium rounded-lg px-2.5 py-1.5 outline-none"
                style={{ border: '1px solid #1f2937', background: '#0d1117', color: '#9ca3af', cursor: 'pointer', fontFamily: 'inherit' }}>
                {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Filters row 2: categories + disputes toggle */}
          <div className="flex items-center gap-1 px-5 py-2" style={{ borderBottom: '1px solid #1f2937' }}>
            <Pill label="All" active={catFilter === 'all' && !showDisputes} onClick={() => { setCatFilter('all'); setShowDisputes(false) }} />
            {categories.map(c => <Pill key={c} label={c} active={catFilter === c && !showDisputes} onClick={() => { setCatFilter(c); setShowDisputes(false) }} color={CAT_COLORS[c] || '#9ca3af'} />)}
            <button
              onClick={() => setShowDisputes(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer"
              style={{
                border: showDisputes ? '1.5px solid #f87171' : '1.5px solid #374151',
                background: showDisputes ? 'rgba(248,113,113,0.1)' : 'transparent',
                color: showDisputes ? '#f87171' : '#6b7280',
              }}>
              ❌ Disputed {disputes.length > 0 && `(${disputes.length})`}
            </button>
          </div>

          {/* Col headers */}
          {!loading && displayed.length > 0 && (
            <div className="grid px-5 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 140px 110px 110px 90px 90px', color: '#374151', borderBottom: '1px solid #1f2937' }}>
              <div>Market</div><div className="pl-6">Odds</div><div>APY</div><div>Expires</div><div className="text-right">Volume</div><div className="text-right">Liquidity</div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-56 gap-3">
              <div className="w-6 h-6 rounded-full border-2" style={{ borderColor: '#1f2937', borderTopColor: '#6b7280', animation: 'spin 0.8s linear infinite' }} />
              <span className="text-[13px]" style={{ color: '#4b5563' }}>Fetching markets…</span>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <span className="text-[14px]" style={{ color: '#f87171' }}>{error}</span>
              <button onClick={() => load()} className="text-[12px] px-4 py-2 rounded-lg" style={{ border: '1px solid #1f2937', color: '#9ca3af', background: '#0d1117', cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && displayed.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <span className="text-3xl">🔍</span>
              <span className="text-[14px] font-semibold" style={{ color: '#9ca3af' }}>No bonds found</span>
              <span className="text-[12px]" style={{ color: '#4b5563' }}>Try adjusting your filters</span>
            </div>
          )}

          {/* Rows */}
          {!loading && !error && displayed.map((bond, i) => <BondRow key={bond.id} bond={bond} index={i} />)}

          {/* Footer */}
          {!loading && !error && displayed.length > 0 && (
            <div className="flex justify-between items-center px-5 py-3" style={{ borderTop: '1px solid #1f2937' }}>
              <span className="text-[12px]" style={{ color: '#4b5563' }}>{displayed.length} of {allBonds.length} markets · live from polymarket.com · auto-refreshes every 60s</span>
              <span className="text-[11px] font-mono" style={{ color: '#1f2937' }}>APY = (1−p)/p × 365/days</span>
            </div>
          )}
        </div>}
        {/* UMA Disputes Section */}
        {showDisputes && (
          <div className="rounded-xl overflow-hidden" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1f2937' }}>
              <span className="text-[12px] font-semibold" style={{ color: '#f87171' }}>⚡ UMA Disputed Markets</span>
              <a href="https://oracle.uma.xyz/?project=Polymarket" target="_blank" rel="noopener noreferrer"
                className="text-[11px]" style={{ color: '#4b5563' }}>View on UMA Oracle →</a>
            </div>
            {disputes.length > 0 && (
              <div className="grid px-5 py-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ gridTemplateColumns: '1fr 140px 110px 110px 90px 90px', color: '#374151', borderBottom: '1px solid #1f2937' }}>
                <div>Market</div><div className="pl-6">Odds</div><div>APY</div><div>Expires</div><div className="text-right">Volume</div><div className="text-right">Liquidity</div>
              </div>
            )}
            {disputes.length === 0 && (
              <div className="flex items-center justify-center h-32">
                <span className="text-[13px]" style={{ color: '#4b5563' }}>No active disputes</span>
              </div>
            )}
            {disputes.map((bond, i) => <BondRow key={bond.id} bond={bond} index={i} />)}
            {disputes.length > 0 && (
              <div className="px-5 py-3" style={{ borderTop: '1px solid #1f2937' }}>
                <span className="text-[12px]" style={{ color: '#4b5563' }}>{disputes.length} markets in UMA dispute resolution · auto-refreshes every 60s</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
