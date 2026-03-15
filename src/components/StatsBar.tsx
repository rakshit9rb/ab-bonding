'use client'
import { Bond, fmtAPY, fmtVolume } from '@/lib/bonds'

interface Props {
  bonds: Bond[]
  fetchedAt: string
}

export default function StatsBar({ bonds, fetchedAt }: Props) {
  const apys = bonds.map((b) => b.apy).filter((a): a is number => a !== null && a < 9999)
  const avgAPY = apys.length ? apys.reduce((a, b) => a + b, 0) / apys.length : null
  const bestAPY = apys.length ? Math.max(...apys) : null
  const now = new Date()
  const expiringToday = bonds.filter(
    (b) => new Date(b.endDate).toDateString() === now.toDateString()
  ).length
  const totalVol = bonds.reduce((s, b) => s + b.volume, 0)

  const time = new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="flex items-center gap-0 border-b border-[var(--border)] overflow-x-auto">
      <Stat label="Markets" value={String(bonds.length)} accent />
      <Divider />
      <Stat label="Avg APY" value={fmtAPY(avgAPY)} color="yield" />
      <Divider />
      <Stat label="Best APY" value={fmtAPY(bestAPY)} color="yield" />
      <Divider />
      <Stat label="Expiring Today" value={String(expiringToday)} color={expiringToday > 0 ? 'danger' : 'dim'} />
      <Divider />
      <Stat label="24h Volume" value={fmtVolume(totalVol)} />
      <div className="ml-auto pr-6 flex items-center gap-2 shrink-0">
        <span className="live-dot w-1.5 h-1.5 rounded-full bg-[var(--accent)] block" />
        <span className="text-[10px] font-mono text-[var(--text-muted)]">{time}</span>
      </div>
    </div>
  )
}

function Stat({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
  const valueClass =
    color === 'yield'
      ? 'text-[var(--yield)] apy-value'
      : color === 'danger'
      ? 'text-[var(--danger)]'
      : color === 'dim'
      ? 'text-[var(--text-dim)]'
      : accent
      ? 'text-[var(--accent)]'
      : 'text-[var(--text)]'

  return (
    <div className="px-5 py-3 shrink-0">
      <div className="text-[9px] font-mono tracking-widest text-[var(--text-muted)] uppercase mb-1">{label}</div>
      <div className={`text-lg font-mono font-semibold leading-none ${valueClass}`}>{value}</div>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-10 bg-[var(--border)] shrink-0" />
}
