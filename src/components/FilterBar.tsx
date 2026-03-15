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
  { value: 'hours', label: '≤24h' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
]

const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: 'apy', label: 'APY ↓' },
  { value: 'prob', label: 'Prob ↓' },
  { value: 'expiry', label: 'Expiry' },
  { value: 'volume', label: 'Volume' },
]

export default function FilterBar({
  timeFilter, setTimeFilter,
  catFilter, setCatFilter,
  sort, setSort,
  categories, onRefresh, loading,
}: Props) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)]/60 backdrop-blur-sm sticky top-[57px] z-10">
      <div className="flex items-center gap-3 px-6 py-2.5 flex-wrap">

        {/* Time */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] uppercase mr-1">Expires</span>
          {TIME_OPTS.map((o) => (
            <button
              key={o.value}
              className={`filter-btn ${timeFilter === o.value ? 'active' : ''}`}
              onClick={() => setTimeFilter(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Category */}
        <div className="flex items-center gap-1.5 overflow-x-auto max-w-[400px]">
          <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] uppercase mr-1 shrink-0">Category</span>
          <button
            className={`filter-btn ${catFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCatFilter('all')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-btn ${catFilter === cat ? 'active' : ''}`}
              onClick={() => setCatFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-[var(--border)]" />

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] uppercase mr-1">Sort</span>
          {SORT_OPTS.map((o) => (
            <button
              key={o.value}
              className={`filter-btn ${sort === o.value ? 'active' : ''}`}
              onClick={() => setSort(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors border border-[var(--border)] hover:border-[var(--accent)] px-3 py-1.5 rounded-sm"
        >
          {loading ? '↻ Loading…' : '↻ Refresh'}
        </button>
      </div>
    </div>
  )
}
