'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Bond, TimeFilter, SortKey, applyFilters, splitPinned, getCategories, fmtAPY, fmtVolume } from '@/lib/bonds'
import { PINNED_MARKETS } from '@/lib/constants'
import BondRow from './BondRow'

const TIME_OPTS: { value: TimeFilter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'hours', label: '24h' },
  { value: 'today', label: 'Today' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' },
]
const SORT_OPTS = [
  { value: 'apy', label: 'APY' }, { value: 'prob', label: 'Probability' },
  { value: 'expiry', label: 'Expiry' }, { value: 'volume', label: 'Volume' },
]

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
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      )}
    </button>
  )
}

interface DashboardProps { initialBonds?: Bond[] }

export default function Dashboard({ initialBonds }: DashboardProps) {
  const [allBonds, setAllBonds] = useState<Bond[]>(initialBonds ?? [])
  const [fetchedAt, setFetchedAt] = useState(() => initialBonds?.length ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
  const [loading, setLoading] = useState(!initialBonds?.length)
  const [error, setError] = useState<string | null>(null)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [catFilter, setCatFilter] = useState('all')
  const [sort, setSort] = useState<SortKey>('apy')
  const [sortAsc, setSortAsc] = useState(false)
  const [excludedCats, setExcludedCats] = useState<Set<string>>(new Set())
  const [showFilter, setShowFilter] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
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
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const categories = useMemo(() => getCategories(allBonds), [allBonds])
  const displayed = useMemo(() => applyFilters(allBonds, timeFilter, catFilter, sort, excludedCats, sortAsc), [allBonds, timeFilter, catFilter, sort, excludedCats, sortAsc])
  const { pinned: pinnedRows, regular: regularRows } = useMemo(() => splitPinned(displayed, PINNED_MARKETS), [displayed])

  const { avgAPY, bestAPY, todayCount } = useMemo(() => {
    let sum = 0, count = 0, best = 0, today = 0
    const todayStr = new Date().toDateString()
    for (const b of allBonds) {
      if (b.apy != null && b.apy < 9999) { sum += b.apy; count++; if (b.apy > best) best = b.apy }
      if (new Date(b.endDate).toDateString() === todayStr) today++
    }
    return { avgAPY: count ? sum / count : null, bestAPY: count ? best : null, todayCount: today }
  }, [allBonds])

  const stats = showDisputes ? [
    { label: 'Disputed',       value: disputes.length,       color: 'var(--text)' },
    { label: 'Avg APY',        value: fmtAPY(disputes.map(b => b.apy).filter((a): a is number => a !== null && a < 9999).reduce((a,b,_,arr) => a + b/arr.length, 0) || null), color: 'var(--green)' },
    { label: 'Best APY',       value: fmtAPY(disputes.map(b => b.apy).filter((a): a is number => a !== null && a < 9999).reduce((a,b) => Math.max(a,b), 0) || null), color: 'var(--green)' },
    { label: 'Expiring Today', value: disputes.filter(b => new Date(b.endDate).toDateString() === new Date().toDateString()).length, color: 'var(--text)' },
  ] : [
    { label: 'Markets',        value: allBonds.length, color: 'var(--text)' },
    { label: 'Avg APY',        value: fmtAPY(avgAPY),  color: 'var(--green)' },
    { label: 'Best APY',       value: fmtAPY(bestAPY), color: 'var(--green)' },
    { label: 'Expiring Today', value: todayCount,      color: 'var(--text)' },
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
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton mb-1" style={{ width: 64 + i * 12, height: 28 }} />
                <div className="skeleton" style={{ width: 80, height: 14 }} />
              </div>
            ))
          ) : (
            stats.map(s => (
              <div key={s.label}>
                <div className="text-[24px] md:text-[36px] font-bold leading-none tracking-[-0.03em] font-mono mb-1" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[13px] md:text-[14px]" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
              </div>
            ))
          )}
        </div>

        {/* Threshold + Time */}
        <div className="flex items-center gap-2 md:gap-3 mb-4 overflow-x-auto no-scrollbar">
          {[0.90, 0.95, 0.97, 0.99].map(p => (
            <FilterLink key={p} label={`${'\u2265'}${(p * 100).toFixed(0)}%`} active={minProb === p} onClick={() => { setMinProb(p); load(p) }} />
          ))}
          <span className="mx-1" style={{ color: 'var(--text-tertiary)', opacity: 0.3 }}>|</span>
          {TIME_OPTS.map(o => <FilterLink key={o.value} label={o.label} active={timeFilter === o.value} onClick={() => setTimeFilter(o.value)} />)}
          <div className="ml-auto">
            <button
              onClick={() => setShowDisputes(v => !v)}
              className="flex items-center gap-1.5 text-[14px] md:text-[15px] cursor-pointer transition-colors whitespace-nowrap"
              style={{ background: 'none', border: 'none', padding: 0, color: showDisputes ? 'var(--text)' : 'var(--text-tertiary)', fontWeight: showDisputes ? 600 : 400, textDecoration: showDisputes ? 'underline' : 'none', textUnderlineOffset: '4px', textDecorationThickness: '2px' }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--red)' }} />
              Disputed{disputes.length > 0 ? ` (${disputes.length})` : ''}
            </button>
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
              <div className="relative shrink-0 ml-auto" ref={filterRef}>
                <button
                  onClick={() => setShowFilter(v => !v)}
                  className="cursor-pointer transition-colors flex items-center gap-1"
                  style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: '14px', fontWeight: 500, color: excludedCats.size > 0 ? 'var(--text)' : 'var(--text-tertiary)' }}
                >
                  Filter{excludedCats.size > 0 ? ` (${excludedCats.size})` : ''} <span style={{ fontSize: '11px', opacity: 0.7 }}>▾</span>
                </button>
                {showFilter && (
                  <div className="absolute right-0 top-7 z-50 rounded-xl py-2 min-w-[160px]" style={{ background: 'var(--bg)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                    <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Exclude categories</div>
                    {categories.map(c => (
                      <button
                        key={c}
                        onClick={() => setExcludedCats(prev => { const next = new Set(prev); next.has(c) ? next.delete(c) : next.add(c); return next })}
                        className="w-full text-left px-3 py-1.5 text-[14px] cursor-pointer flex items-center gap-2"
                        style={{ background: 'none', border: 'none', fontFamily: 'inherit', color: excludedCats.has(c) ? 'var(--red)' : 'var(--text-secondary)' }}
                      >
                        <span style={{ opacity: excludedCats.has(c) ? 1 : 0 }}>✕</span>{c}
                      </button>
                    ))}
                    {excludedCats.size > 0 && (
                      <button onClick={() => setExcludedCats(new Set())} className="w-full text-left px-3 pt-2 pb-1 text-[12px] cursor-pointer" style={{ background: 'none', border: 'none', borderTop: '1px solid var(--border)', fontFamily: 'inherit', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Column headers — desktop only */}
            {!loading && displayed.length > 0 && (
              <div className="hidden md:grid py-3 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
                <div></div><div>Market</div>
                {(['prob','apy','expiry'] as const).map((key, i) => (
                  <button key={key} onClick={() => { if (sort === key) setSortAsc(v => !v); else { setSort(key); setSortAsc(false) } }} className="text-left cursor-pointer flex items-center gap-1" style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: sort === key ? 'var(--text)' : 'var(--text-tertiary)' }}>
                    {['Odds','APY','Expires'][i]}
                    <span style={{ fontSize: '10px', opacity: sort === key ? 1 : 0.3 }}>{sort === key ? (sortAsc ? '↑' : '↓') : '↓'}</span>
                  </button>
                ))}
                <div className="text-right">Vol</div><div className="text-right">Liq</div>
              </div>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="py-4 md:grid md:items-center"
                    style={{ gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px', borderBottom: '1px solid var(--border)', animationDelay: `${i * 0.05}s` }}
                  >
                    <div className="hidden md:block skeleton" style={{ width: 16, height: 16 }} />
                    <div className="flex items-center gap-2 mb-2 md:mb-0 md:pr-8">
                      <div className="md:hidden skeleton" style={{ width: 14, height: 14, flexShrink: 0 }} />
                      <div className="skeleton" style={{ width: `${55 + (i % 4) * 10}%`, height: 16 }} />
                    </div>
                    <div className="flex items-center gap-4 md:hidden pl-7">
                      <div className="skeleton" style={{ width: 48, height: 14 }} />
                      <div className="skeleton" style={{ width: 56, height: 14 }} />
                      <div className="skeleton" style={{ width: 44, height: 14 }} />
                    </div>
                    <div className="hidden md:block skeleton" style={{ width: 56, height: 16 }} />
                    <div className="hidden md:block skeleton" style={{ width: 64, height: 16 }} />
                    <div className="hidden md:block skeleton" style={{ width: 72, height: 16 }} />
                    <div className="hidden md:flex justify-end"><div className="skeleton" style={{ width: 52, height: 16 }} /></div>
                    <div className="hidden md:flex justify-end"><div className="skeleton" style={{ width: 52, height: 16 }} /></div>
                  </div>
                ))}
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
            {!loading && !error && (<>
              {pinnedRows.map((bond, i) => <BondRow key={bond.id} bond={bond} index={i} pinned />)}
              {regularRows.map((bond, i) => <BondRow key={bond.id} bond={bond} index={pinnedRows.length + i} />)}
            </>)}

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
              <div className="hidden md:grid py-3 text-[13px] font-semibold uppercase tracking-[0.06em]" style={{ gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px', color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
                <div></div><div>Market</div>
                {(['prob','apy','expiry'] as const).map((key, i) => (
                  <button key={key} onClick={() => { if (sort === key) setSortAsc(v => !v); else { setSort(key); setSortAsc(false) } }} className="text-left cursor-pointer flex items-center gap-1" style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', color: sort === key ? 'var(--text)' : 'var(--text-tertiary)' }}>
                    {['Odds','APY','Expires'][i]}
                    <span style={{ fontSize: '10px', opacity: sort === key ? 1 : 0.3 }}>{sort === key ? (sortAsc ? '↑' : '↓') : '↓'}</span>
                  </button>
                ))}
                <div className="text-right">Vol</div><div className="text-right">Liq</div>
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
