'use client'
import { Bond, fmtAPY, fmtVolume, fmtExpiry } from '@/lib/bonds'

const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  Crypto:        { bg: 'rgba(251,191,36,0.1)',   color: '#fbbf24' },
  Politics:      { bg: 'rgba(96,165,250,0.1)',   color: '#60a5fa' },
  Finance:       { bg: 'rgba(74,222,128,0.1)',   color: '#4ade80' },
  Sports:        { bg: 'rgba(192,132,252,0.1)',  color: '#c084fc' },
  Technology:    { bg: 'rgba(34,211,238,0.1)',   color: '#22d3ee' },
  Science:       { bg: 'rgba(52,211,153,0.1)',   color: '#34d399' },
  Weather:       { bg: 'rgba(56,189,248,0.1)',   color: '#38bdf8' },
  Entertainment: { bg: 'rgba(244,114,182,0.1)',  color: '#f472b6' },
  Other:         { bg: 'rgba(156,163,175,0.1)',  color: '#9ca3af' },
}
function getCat(c: string) { return CAT_COLORS[c] || CAT_COLORS.Other }

interface Props { bond: Bond; index: number; compact?: boolean }

export default function BondRow({ bond, index, compact }: Props) {
  const { label, urgency } = fmtExpiry(bond.endDate)
  const probPct = (bond.price * 100).toFixed(1)
  const expColor = urgency === 'critical' ? '#f87171' : urgency === 'soon' ? '#fbbf24' : '#6b7280'
  const apyHigh  = (bond.apy ?? 0) > 500
  const apyColor = apyHigh ? '#fbbf24' : '#4ade80'
  const url = `https://polymarket.com/event/${bond.slug}?via=onlybonds`
  const cols = compact ? '1fr 140px 90px 90px' : '1fr 140px 110px 110px 90px 90px'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="bond-row grid gap-0 px-5 py-3.5 border-b border-[#1f2937] hover:bg-white/[0.03] transition-colors no-underline group"
      style={{ gridTemplateColumns: cols, animationDelay: `${index * 0.03}s` }}
    >
      {/* Name */}
      <div className="pr-6 flex flex-col justify-center min-w-0">
        <div className="text-[13px] font-medium text-[#e5e7eb] group-hover:text-white transition-colors truncate leading-snug">
          {bond.question}
        </div>
      </div>

      {/* Prob */}
      <div className="flex items-center pl-6">
        <span className="text-[14px] font-bold" style={{ color: '#4ade80' }}>{probPct}%</span>
      </div>

      {/* APY — hidden in compact mode */}
      {!compact && (
        <div className="flex items-center">
          <span className="text-[13px] font-bold" style={{ color: apyColor }}>{fmtAPY(bond.apy)}</span>
        </div>
      )}

      {/* Expiry — hidden in compact mode */}
      {!compact && (
        <div className="flex items-center">
          <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: expColor }}>{label}</span>
        </div>
      )}

      {/* Volume */}
      <div className="flex items-center justify-end">
        <span className="text-[13px] font-medium text-[#4b5563]">{fmtVolume(bond.volume)}</span>
      </div>

      {/* Liquidity */}
      <div className="flex items-center justify-end">
        <span className="text-[13px] font-medium text-[#4b5563]">{fmtVolume(bond.liquidity)}</span>
      </div>
    </a>
  )
}
