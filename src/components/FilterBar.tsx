'use client'
import { TimeFilter, SortKey } from '@/lib/bonds'

interface Props {
  timeFilter: TimeFilter
  setTimeFilter: (t: TimeFilter) => void
  catFilter: string
  setCatFilter: (c: string) => void
  sort: SortKey
  setSort: (s: SortKey) => void
  categories: string[]
  onRefresh: () => void
  loading: boolean
}

const TIME_OPTS: { value: TimeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'hours', label: '24h' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: 'apy', label: 'APY' },
  { value: 'prob', label: 'Probability' },
  { value: 'expiry', label: 'Expiry' },
  { value: 'volume', label: 'Volume' },
  { value: 'liquidity', label: 'Liquidity' },
]

function SegmentButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-all cursor-pointer"
      style={{
        background: active ? 'var(--accent-subtle)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        border: 'none',
      }}
    >
      {label}
    </button>
  )
}

export default function FilterBar({
  timeFilter, setTimeFilter,
  catFilter, setCatFilter,
  sort, setSort,
  categories, onRefresh, loading,
}: Props) {
  return (
    <div className="backdrop-blur-sm sticky top-14 z-10" style={{ background: 'color-mix(in srgb, var(--surface) 90%, transparent)', borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-3 px-6 py-2.5 flex-wrap">

        {/* Time */}
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--surface-secondary)' }}>
          {TIME_OPTS.map((o) => (
            <SegmentButton key={o.value} label={o.label} active={timeFilter === o.value} onClick={() => setTimeFilter(o.value)} />
          ))}
        </div>

        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* Category */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          <SegmentButton label="All" active={catFilter === 'all'} onClick={() => setCatFilter('all')} />
          {categories.map((cat) => (
            <SegmentButton key={cat} label={cat} active={catFilter === cat} onClick={() => setCatFilter(cat)} />
          ))}
        </div>

        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* Sort */}
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="text-[13px] font-medium rounded-lg px-3 py-1.5 outline-none font-sans"
          style={{ border: '1px solid var(--border)', background: 'var(--surface-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', background: 'transparent' }}
        >
          {loading ? '\u21BB Loading\u2026' : '\u21BB Refresh'}
        </button>
      </div>
    </div>
  )
}
