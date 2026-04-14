'use client'
import { memo, useState } from 'react'
import { Bond, fmtGain, fmtVolume, fmtExpiry } from '@/lib/bonds'
import TradeModal from './TradeModal'

interface Props { bond: Bond; index: number; compact?: boolean; pinned?: boolean }

export default memo(function BondRow({ bond, index, pinned }: Props) {
  const { label, urgency } = fmtExpiry(bond.endDate)
  const probPct = (bond.price * 100).toFixed(1)
  const expColor = 'var(--text-secondary)'
  const apyColor = 'var(--green)'
  const url = `https://polymarket.com/event/${bond.slug}?via=onlybonds`
  const [showTrade, setShowTrade] = useState(false)

  return (
    <>
      <div
        className="bond-row block py-4 transition-colors group md:grid md:items-center md:gap-0"
        style={{
          gridTemplateColumns: '24px 1fr 110px 100px 120px 90px 90px 72px',
          animationDelay: `${index * 0.03}s`,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Arrow — desktop grid cell */}
        <a href={url} target="_blank" rel="noopener noreferrer" className="hidden md:block no-underline"
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <span className="text-[16px] leading-none" style={{ color: 'var(--text-tertiary)', transform: 'rotate(-45deg)', display: 'inline-block' }}>{'\u2192'}</span>
        </a>

        {/* Name — always visible */}
        <a href={url} target="_blank" rel="noopener noreferrer" className="md:pr-8 min-w-0 flex items-center gap-2 mb-2 md:mb-0 no-underline"
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <span className="md:hidden inline-block text-[14px] leading-none shrink-0" style={{ color: 'var(--text-tertiary)', transform: 'rotate(-45deg)' }}>{'\u2192'}</span>
          <div className="text-[15px] font-medium truncate leading-snug" style={{ color: 'var(--text)' }}>
            {bond.question}
          </div>
          {pinned && <span className="hidden md:inline flex-shrink-0 text-[11px] font-semibold tracking-wide" style={{ color: 'var(--purple)' }}>* featured</span>}
        </a>

        {/* Mobile: compact row */}
        <div className="flex items-center gap-4 md:hidden pl-7">
          <span className="text-[14px] font-bold tabular-nums" style={{ color: 'var(--green)' }}>{probPct}%</span>
          <span className="text-[14px] font-bold tabular-nums" style={{ color: apyColor }}>{fmtGain(bond.price)}</span>
          <span className="text-[13px]" style={{ color: expColor }}>{label}</span>
          <button
            onClick={() => setShowTrade(true)}
            className="ml-auto px-2.5 py-1 rounded-lg text-[12px] font-semibold cursor-pointer transition-all"
            style={{ background: 'rgba(5,150,80,0.15)', border: '1px solid rgba(5,150,80,0.3)', color: '#4ade80' }}
          >
            Trade
          </button>
        </div>

        {/* Desktop columns */}
        <div className="hidden md:flex items-center">
          <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--green)' }}>{probPct}%</span>
        </div>

        <div className="hidden md:flex items-center">
          <span className="text-[15px] font-bold tabular-nums" style={{ color: apyColor }}>{fmtGain(bond.price)}</span>
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

        {/* Trade button — desktop */}
        <div className="hidden md:flex items-center justify-end">
          <button
            onClick={() => setShowTrade(true)}
            className="px-3 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer transition-all opacity-0 group-hover:opacity-100"
            style={{ background: 'rgba(5,150,80,0.15)', border: '1px solid rgba(5,150,80,0.3)', color: '#4ade80' }}
          >
            Trade
          </button>
        </div>
      </div>

      {showTrade && <TradeModal bond={bond} onClose={() => setShowTrade(false)} />}
    </>
  )
})
