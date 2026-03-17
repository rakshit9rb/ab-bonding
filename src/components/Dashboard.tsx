'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Bond, TimeFilter, SortKey, applyFilters, getCategories, fmtAPY, fmtVolume } from '@/lib/bonds'
import BondRow from './BondRow'

function FilterLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[14px] md:text-[15px] cursor-pointer transition-colors whitespace-nowrap"
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: active ? 'var(--text)' : 'var(--text-tertiary)',
        fontWeight: active ? 600 : 400,
        textDecoration: active ? 'underline' : 'none',
        textUnderlineOffset: '4px',
        textDecorationThickness: '2px',
      }}
    >
      {label}
    </button>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored === 'dark' || (!stored && prefersDark)
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      className="text-[14px] cursor-pointer transition-colors"
      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-tertiary)' }}
      aria-label="Toggle theme"
    >
      {dark ? 'Light' : 'Dark'}
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

  const minProbRef = useRef(minProb)
  minProbRef.current = minProb

  const load = useCallback(async (prob?: number) => {
    const p = prob ?? minProbRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/markets?minProb=${p}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setAllBonds(data.bonds ?? [])
      setFetchedAt(new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setError('Could not fetch markets.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [load])
  useEffect(() => { loadDisputes(); const id = setInterval(loadDisputes, 60000); return () => clearInterval(id) }, [loadDisputes])

  const categories = getCategories(allBonds)
  const displayed = applyFilters(allBonds, timeFilter, catFilter, sort)
  const apys = allBonds.map(b => b.apy).filter((a): a is number => a !== null && a < 9999)
  const avgAPY = apys.length ? apys.reduce((a, b) => a + b, 0) / apys.length : null
  const bestAPY = apys.length ? Math.max(...apys) : null
  const todayCount = allBonds.filter(b => new Date(b.endDate).toDateString() === new Date().toDateString()).length

  const TIME_OPTS: { value: TimeFilter; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'hours', label: '24h' },
    { value: 'today', label: 'Today' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' },
  ]
  const SORT_OPTS = [
    { value: 'apy', label: 'APY' }, { value: 'prob', label: 'Probability' },
    { value: 'expiry', label: 'Expiry' }, { value: 'volume', label: 'Volume' },
  ]

  const stats = showDisputes ? [
    { label: 'Disputed',       value: disputes.length,       color: 'var(--text)' },
    { label: 'Avg APY',        value: fmtAPY(disputes.map(b => b.apy).filter((a): a is number => a !== null && a < 9999).reduce((a,b,_,arr) => a + b/arr.length, 0) || null), color: 'var(--green)' },
    { label: 'Best APY',       value: fmtAPY(disputes.map(b => b.apy).filter((a): a is number => a !== null && a < 9999).reduce((a,b) => Math.max(a,b), 0) || null), color: 'var(--green)' },
    { label: 'Expiring Today', value: disputes.filter(b => new Date(b.endDate).toDateString() === new Date().toDateString()).length, color: 'var(--text)' },
  ] : [
    { label: 'Markets',        value: loading ? '\u2014' : allBonds.length, color: 'var(--text)' },
    { label: 'Avg APY',        value: loading ? '\u2014' : fmtAPY(avgAPY),  color: 'var(--green)' },
    { label: 'Best APY',       value: loading ? '\u2014' : fmtAPY(bestAPY), color: 'var(--green)' },
    { label: 'Expiring Today', value: loading ? '\u2014' : todayCount,      color: 'var(--text)' },
  ]

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* Navbar */}
      <nav className="sticky top-0 z-30 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--bg) 85%, transparent)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-4 md:px-8 h-14 md:h-16">
          <div className="flex items-center gap-2 md:gap-2.5">
            <img src="/light.svg" alt="OnlyBonds" className="h-5 md:h-7 dark:hidden" />
            <img src="/dark.svg" alt="OnlyBonds" className="h-5 md:h-7 hidden dark:block" />
            <span className="text-[12px] md:text-[14px]" style={{ color: 'var(--text-tertiary)' }}><span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>by</span> <a href="https://x.com/rb_tweets" target="_blank" rel="noopener noreferrer" className="font-sans" style={{ color: 'var(--text-secondary)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>@rb_tweets</a></span>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            {!loading && <span className="hidden md:inline text-[14px]" style={{ color: 'var(--text-tertiary)' }}>{fetchedAt}</span>}
            <ThemeToggle />
            <button
              onClick={() => load()}
              disabled={loading}
              className="text-[14px] font-semibold cursor-pointer transition-colors"
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)' }}
            >
              {loading ? 'Loading\u2026' : 'Refresh'}
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-8 md:pt-16 pb-16 md:pb-24">

        {/* Hero */}
        <div className="mb-8 md:mb-16">
          <h1 className="text-[28px] md:text-[48px] font-bold tracking-[-0.02em] leading-[1.1] mb-2 md:mb-3" style={{ color: 'var(--accent)' }}>
            High-probability bonds
          </h1>
          <p className="text-[15px] md:text-[18px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Near-certain Polymarket outcomes ranked by annualized yield.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:flex md:gap-16 mb-8 md:mb-16">
          {stats.map(s => (
            <div key={s.label}>
              <div className="text-[24px] md:text-[36px] font-bold leading-none tracking-[-0.03em] font-mono mb-1" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[13px] md:text-[14px]" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Threshold + Time */}
        <div className="flex items-center gap-2 md:gap-3 mb-4 overflow-x-auto no-scrollbar">
          {[0.90, 0.95, 0.97, 0.99].map(p => (
            <FilterLink key={p} label={`${'\u2265'}${(p * 100).toFixed(0)}%`} active={minProb === p} onClick={() => { setMinProb(p); load(p) }} />
          ))}
          <span className="mx-1" style={{ color: 'var(--text-tertiary)', opacity: 0.3 }}>|</span>
          {TIME_OPTS.map(o => <FilterLink key={o.value} label={o.label} active={timeFilter === o.value} onClick={() => setTimeFilter(o.value)} />)}
          <div className="ml-auto">
            <FilterLink label={`Disputed${disputes.length > 0 ? ` (${disputes.length})` : ''}`} active={showDisputes} onClick={() => setShowDisputes(v => !v)} />
          </div>
        </div>

        {/* Divider */}
        <div className="mb-4 md:mb-8" style={{ borderTop: '2px solid var(--text)', opacity: 0.12 }} />

        {/* Main table */}
        {!showDisputes && (
          <div>
            {/* Categories + Sort */}
            <div className="flex items-center gap-2 md:gap-3 mb-6 md:mb-8">
              <div className="flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar min-w-0">
                <FilterLink label="All" active={catFilter === 'all' && !showDisputes} onClick={() => { setCatFilter('all'); setShowDisputes(false) }} />
                {categories.map(c => <FilterLink key={c} label={c} active={catFilter === c && !showDisputes} onClick={() => { setCatFilter(c); setShowDisputes(false) }} />)}
              </div>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="ml-auto shrink-0 text-[14px] md:text-[15px] font-medium cursor-pointer outline-none font-sans"
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', appearance: 'auto' }}
              >
                {SORT_OPTS.map(o => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
              </select>
            </div>

            {/* Column headers — desktop only */}
            {!loading && displayed.length > 0 && (
              <div className="hidden md:grid py-3 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px 80px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
                <div></div><div>Market</div><div>Prob</div><div>APY</div><div>Expires</div><div className="text-right">Vol</div><div className="text-right">Liq</div><div></div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center h-48 md:h-64">
                <span className="text-[16px] md:text-[18px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>Loading{'\u2026'}</span>
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center h-48 md:h-56 gap-3">
                <span className="text-[16px] md:text-[18px] font-semibold" style={{ color: 'var(--red)' }}>{error}</span>
                <button onClick={() => load()} className="text-[15px] font-semibold cursor-pointer" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)' }}>Retry</button>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && displayed.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 md:h-56 gap-1">
                <span className="text-[16px] md:text-[18px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No bonds found</span>
                <span className="text-[14px] md:text-[15px]" style={{ color: 'var(--text-tertiary)' }}>Try adjusting your filters</span>
              </div>
            )}

            {/* Rows */}
            {!loading && !error && displayed.map((bond, i) => <BondRow key={bond.id} bond={bond} index={i} />)}

            {/* Footer */}
            {!loading && !error && displayed.length > 0 && (
              <div className="flex justify-between items-center pt-6 mt-2">
                <span className="text-[13px] md:text-[14px]" style={{ color: 'var(--text-tertiary)' }}>{displayed.length} of {allBonds.length} markets</span>
                <span className="hidden md:inline text-[13px] font-mono" style={{ color: 'var(--text-tertiary)' }}>APY = (1{'\u2212'}p)/p {'\u00d7'} 365/d</span>
              </div>
            )}
          </div>
        )}

        {/* Disputes */}
        {showDisputes && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 md:mb-8">
              <div className="flex items-baseline gap-3">
                <span className="text-[20px] md:text-[24px] font-bold tracking-[-0.02em]" style={{ color: 'var(--red)' }}>UMA Disputed Markets</span>
                <span className="text-[16px] md:text-[18px] font-bold" style={{ color: 'var(--red)', opacity: 0.5 }}>{disputes.length}</span>
              </div>
              <div className="flex items-center gap-5">
                <a href="https://oracle.uma.xyz/?project=Polymarket" target="_blank" rel="noopener noreferrer"
                  className="text-[14px] transition-colors" style={{ color: 'var(--text-tertiary)' }}>UMA Oracle {'\u2192'}</a>
                <button
                  onClick={() => setShowDisputes(false)}
                  className="text-[14px] font-semibold cursor-pointer transition-colors"
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)' }}
                >
                  Back
                </button>
              </div>
            </div>
            {disputes.length > 0 && (
              <div className="hidden md:grid py-3 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px 80px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
                <div></div><div>Market</div><div>Prob</div><div>APY</div><div>Expires</div><div className="text-right">Vol</div><div className="text-right">Liq</div><div></div>
              </div>
            )}
            {disputes.length === 0 && (
              <div className="flex items-center justify-center h-40">
                <span className="text-[16px] md:text-[18px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>No active disputes</span>
              </div>
            )}
            {disputes.map((bond, i) => <BondRow key={bond.id} bond={bond} index={i} />)}
            {disputes.length > 0 && (
              <div className="pt-6 mt-2">
                <span className="text-[14px]" style={{ color: 'var(--text-tertiary)' }}>{disputes.length} disputed markets</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
