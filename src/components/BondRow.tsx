'use client'
import { Bond, fmtAPY, fmtVolume, fmtExpiry } from '@/lib/bonds'

interface Props { bond: Bond; index: number; compact?: boolean }

export default function BondRow({ bond, index, compact }: Props) {
  const { label, urgency } = fmtExpiry(bond.endDate)
  const probPct = (bond.price * 100).toFixed(1)
  const expColor = 'var(--text-secondary)'
  const apyColor = 'var(--green)'
  const url = `https://polymarket.com/event/${bond.slug}?via=onlybonds`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="bond-row block py-4 transition-colors no-underline group md:grid md:items-center md:gap-0"
      style={{
        gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px 80px',
        animationDelay: `${index * 0.03}s`,
        borderBottom: '1px solid var(--border)',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {/* Desktop layout */}
      <span className="hidden md:block text-[28px] font-bold leading-none" style={{ color: 'var(--text-tertiary)' }}>*</span>

      {/* Name — always visible */}
      <div className="md:pr-8 min-w-0 flex items-center gap-2 mb-2 md:mb-0">
        <span className="md:hidden text-[20px] font-bold leading-none" style={{ color: 'var(--text-tertiary)' }}>*</span>
        <div className="text-[15px] md:text-[15px] font-medium truncate leading-snug" style={{ color: 'var(--text)' }}>
          {bond.question}
        </div>
      </div>

      {/* Mobile: compact row with key values */}
      <div className="flex items-center gap-4 md:hidden pl-7">
        <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--purple)' }}>{probPct}%</span>
        <span className="text-[14px] font-bold tabular-nums" style={{ color: apyColor }}>{fmtAPY(bond.apy)}</span>
        <span className="text-[13px]" style={{ color: expColor }}>{label}</span>
        <span className="ml-auto text-[13px] font-medium" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>Buy <span style={{ display: 'inline-block', transform: 'rotate(-45deg)' }}>{'\u2192'}</span></span>
      </div>

      {/* Desktop-only columns */}
      <div className="hidden md:flex items-center">
        <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--purple)' }}>{probPct}%</span>
      </div>

      <div className="hidden md:flex items-center">
        <span className="text-[15px] font-bold tabular-nums" style={{ color: apyColor }}>{fmtAPY(bond.apy)}</span>
      </div>

      <div className="hidden md:flex items-center">
        <span className="text-[14px] whitespace-nowrap" style={{ color: expColor }}>{label}</span>
      </div>

      <div className="hidden md:flex items-center justify-end">
        <span className="text-[14px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{fmtVolume(bond.volume)}</span>
      </div>

      <div className="hidden md:flex items-center justify-end">
        <span className="text-[14px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>{fmtVolume(bond.liquidity)}</span>
      </div>

      <div className="hidden md:flex items-center justify-end">
        <span className="text-[13px] font-medium" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>Buy <span style={{ display: 'inline-block', transform: 'rotate(-45deg)' }}>{'\u2192'}</span></span>
      </div>
    </a>
  )
}
