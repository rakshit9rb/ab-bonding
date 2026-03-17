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
    <div className="flex items-center gap-0 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
      <Stat label="Markets" value={String(bonds.length)} accent />
      <Divider />
      <Stat label="Avg APY" value={fmtAPY(avgAPY)} color="green" />
      <Divider />
      <Stat label="Best APY" value={fmtAPY(bestAPY)} color="green" />
      <Divider />
      <Stat label="Expiring Today" value={String(expiringToday)} color={expiringToday > 0 ? 'red' : 'dim'} />
      <Divider />
      <Stat label="24h Volume" value={fmtVolume(totalVol)} />
      <div className="ml-auto pr-6 flex items-center gap-2 shrink-0">
        <span className="live-dot w-1.5 h-1.5 rounded-full block" style={{ background: 'var(--accent)' }} />
        <span className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{time}</span>
      </div>
    </div>
  )
}

function Stat({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
  const valueColor =
    color === 'green' ? 'var(--green)'
    : color === 'red' ? 'var(--red)'
    : color === 'dim' ? 'var(--text-tertiary)'
    : accent ? 'var(--accent)'
    : 'var(--text)'

  return (
    <div className="px-5 py-3.5 shrink-0">
      <div className="text-[10px] font-medium tracking-wider uppercase mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="text-lg font-mono font-semibold leading-none" style={{ color: valueColor }}>{value}</div>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-10 shrink-0" style={{ background: 'var(--border)' }} />
}
