'use client'
import { memo } from 'react'
import { Bond, fmtAPY, fmtVolume, fmtExpiry } from '@/lib/bonds'

interface Props { bond: Bond; index: number; pinned?: boolean }

export default memo(function BondRow({ bond, index, pinned }: Props) {
  const { label } = fmtExpiry(bond.endDate)
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
        gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px',
        animationDelay: `${index * 0.03}s`,
        borderBottom: '1px solid var(--border)',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {/* Arrow — desktop grid cell */}
      <span className="hidden md:block text-[16px] leading-none" style={{ color: 'var(--text-tertiary)', transform: 'rotate(-45deg)' }}>{'\u2192'}</span>

      {/* Name — always visible */}
      <div className="md:pr-8 min-w-0 flex items-center gap-2 mb-2 md:mb-0">
        {/* Arrow — mobile only */}
        <span className="md:hidden inline-block text-[14px] leading-none shrink-0" style={{ color: 'var(--text-tertiary)', transform: 'rotate(-45deg)' }}>{'\u2192'}</span>
        <div className="text-[15px] font-medium truncate leading-snug" style={{ color: 'var(--text)' }}>
          {bond.question}
        </div>
        {pinned && <span className="hidden md:inline flex-shrink-0 text-[11px] font-semibold tracking-wide" style={{ color: 'var(--purple)' }}>* featured</span>}
      </div>

      {/* Mobile: compact row with key values */}
      <div className="flex items-center gap-4 md:hidden pl-7">
        <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--green)' }}>{probPct}%</span>
        <span className="text-[14px] font-bold tabular-nums" style={{ color: apyColor }}>{fmtAPY(bond.apy)}</span>
        <span className="text-[13px]" style={{ color: expColor }}>{label}</span>
      </div>

      {/* Desktop-only columns */}
      <div className="hidden md:flex items-center">
        <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--green)' }}>{probPct}%</span>
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

    </a>
  )
})
