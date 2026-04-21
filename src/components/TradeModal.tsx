'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { usePostHog } from 'posthog-js/react'
import { createWalletClient, custom } from 'viem'
import { polygon } from 'viem/chains'
import { Bond } from '@/lib/bonds'
import {
  CLOB_URL, calcMarketPreview, signAndPlaceOrder,
  getUsdcBalance, OrderBook, OrderPreview, Side, OrderType
} from '@/lib/polymarket'

interface Props {
  bond: Bond
  onClose: () => void
}

type Outcome = 'YES' | 'NO'

export default function TradeModal({ bond, onClose }: Props) {
  const { ready, authenticated, login, user } = usePrivy()
  const { wallets } = useWallets()
  const posthog = usePostHog()

  const [outcome, setOutcome] = useState<Outcome>('YES')
  const [orderType, setOrderType] = useState<OrderType>('FOK') // FOK = market order
  const [amount, setAmount] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [book, setBook] = useState<OrderBook | null>(null)
  const [preview, setPreview] = useState<OrderPreview | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')

  const wallet = wallets[0]
  const tokenId = outcome === 'YES' ? bond.clobTokenIds?.[0] : bond.clobTokenIds?.[1]

  const metricProps = useCallback((overrides: Record<string, unknown> = {}) => ({
    user_id: user?.id ?? null,
    wallet_address: wallet?.address ?? null,
    bond_id: bond.id,
    condition_id: bond.conditionId,
    market_slug: bond.slug,
    trade_dir: 'BUY',
    outcome,
    order_type: orderType,
    neg_risk: bond.negRisk,
    ...overrides,
  }), [user?.id, wallet?.address, bond.id, bond.conditionId, bond.slug, outcome, orderType, bond.negRisk])

  useEffect(() => {
    if (!authenticated || !user?.id) return
    posthog?.identify(user.id, { wallet_address: wallet?.address ?? null })
  }, [authenticated, user?.id, wallet?.address, posthog])

  // Fetch order book
  useEffect(() => {
    if (!tokenId) return
    fetch(`${CLOB_URL}/book?token_id=${tokenId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setBook(data))
      .catch(() => {})
  }, [tokenId])

  // Fetch USDC balance
  useEffect(() => {
    if (!wallet?.address) return
    getUsdcBalance(wallet.address).then(setUsdcBalance)
  }, [wallet?.address])

  // Recalculate preview
  useEffect(() => {
    if (!book || !amount) { setPreview(null); return }
    const usdc = parseFloat(amount)
    if (isNaN(usdc) || usdc <= 0) { setPreview(null); return }
    if (orderType === 'FOK') {
      setPreview(calcMarketPreview(book, usdc, outcome))
    } else {
      const price = parseFloat(limitPrice)
      if (isNaN(price) || price <= 0 || price >= 1) { setPreview(null); return }
      const shares = usdc / price
      setPreview({ avgPrice: price, shares, totalCost: usdc, potentialReturn: shares - usdc, priceImpact: 0 })
    }
  }, [book, amount, outcome, orderType, limitPrice])

  const handleTrade = useCallback(async () => {
    if (!authenticated) { login(); return }
    if (!wallet || !tokenId) return

    const usdc = parseFloat(amount)
    if (!preview || isNaN(usdc) || usdc <= 0) return
    const tradeProps = metricProps({
      token_id: tokenId,
      shares: preview.shares,
      avg_price: orderType === 'FOK' ? preview.avgPrice : parseFloat(limitPrice),
      notional_usdc: usdc,
      price_impact: preview.priceImpact,
    })
    posthog?.capture('trade_submit_clicked', tradeProps)

    setStatus('loading')
    setStatusMsg('')

    try {
      await wallet.switchChain(137)
      const provider = await wallet.getEthereumProvider()
      const walletClient = createWalletClient({ chain: polygon, transport: custom(provider) })

      const price = orderType === 'FOK' ? preview.avgPrice : parseFloat(limitPrice)

      const result = await signAndPlaceOrder({
        walletClient,
        address: wallet.address,
        tokenId,
        side: 'BUY' as Side,
        orderType,
        price,
        size: preview.shares,
        negRisk: bond.negRisk,
      })

      if (result.success) {
        posthog?.capture('trade_succeeded', {
          ...tradeProps,
          order_id: result.orderId ?? null,
        })
        setStatus('success')
        setStatusMsg(`Order placed! ID: ${result.orderId?.slice(0, 12)}…`)
        // Refresh balance
        getUsdcBalance(wallet.address).then(setUsdcBalance)
      } else {
        posthog?.capture('trade_failed', {
          ...tradeProps,
          error_message: result.error ?? 'Order failed',
        })
        setStatus('error')
        setStatusMsg(result.error ?? 'Order failed')
      }
    } catch (e: any) {
      posthog?.capture('trade_failed', {
        ...tradeProps,
        error_message: e?.message ?? 'Unknown error',
      })
      setStatus('error')
      setStatusMsg(e?.message ?? 'Unknown error')
    }
  }, [authenticated, login, wallet, tokenId, amount, preview, orderType, limitPrice, bond.negRisk, posthog, metricProps])

  const insufficientBalance = usdcBalance !== null && parseFloat(amount || '0') > usdcBalance
  const bestYesPrice = book?.asks?.[0] ? parseFloat(book.asks[0].price) : null
  const impliedProb = bestYesPrice ?? bond.price

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full md:w-[420px] rounded-t-2xl md:rounded-2xl p-5 md:p-6"
        style={{ background: '#0d1117', border: '1px solid #1f2937' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 pr-4">
            <div className="text-[12px] mb-1" style={{ color: 'var(--text-tertiary)' }}>Trade</div>
            <div className="text-[14px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>
              {bond.question}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* Current price */}
        <div className="flex items-center gap-4 mb-5 p-3 rounded-xl" style={{ background: '#161b22' }}>
          <div>
            <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>YES price</div>
            <div className="text-[18px] font-bold font-mono" style={{ color: 'var(--green)' }}>{(impliedProb * 100).toFixed(1)}¢</div>
          </div>
          <div>
            <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>NO price</div>
            <div className="text-[18px] font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{((1 - impliedProb) * 100).toFixed(1)}¢</div>
          </div>
          {usdcBalance !== null && (
            <div className="ml-auto text-right">
              <div className="text-[11px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>Balance</div>
              <div className="text-[14px] font-mono font-semibold" style={{ color: 'var(--text)' }}>${usdcBalance.toFixed(2)}</div>
            </div>
          )}
        </div>

        {/* Outcome toggle */}
        <div className="flex gap-2 mb-4">
          {(['YES', 'NO'] as Outcome[]).map(o => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className="flex-1 py-2 rounded-lg font-semibold text-[14px] cursor-pointer transition-all"
              style={{
                background: outcome === o ? (o === 'YES' ? 'rgba(5,150,80,0.2)' : 'rgba(220,38,38,0.15)') : 'rgba(255,255,255,0.05)',
                border: `1px solid ${outcome === o ? (o === 'YES' ? 'rgba(5,150,80,0.5)' : 'rgba(220,38,38,0.4)') : 'rgba(255,255,255,0.08)'}`,
                color: outcome === o ? (o === 'YES' ? '#4ade80' : '#f87171') : 'var(--text-tertiary)',
              }}
            >
              {o}
            </button>
          ))}
        </div>

        {/* Order type */}
        <div className="flex gap-2 mb-4">
          {([{ v: 'FOK', l: 'Market' }, { v: 'GTC', l: 'Limit' }] as { v: OrderType; l: string }[]).map(o => (
            <button
              key={o.v}
              onClick={() => setOrderType(o.v)}
              className="flex-1 py-1.5 rounded-lg text-[13px] cursor-pointer transition-all"
              style={{
                background: orderType === o.v ? 'rgba(23,94,202,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${orderType === o.v ? 'rgba(23,94,202,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: orderType === o.v ? '#60a5fa' : 'var(--text-tertiary)',
              }}
            >
              {o.l}
            </button>
          ))}
        </div>

        {/* Limit price (only for limit orders) */}
        {orderType === 'GTC' && (
          <div className="mb-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#6b7280' }}>
              Limit Price (0–1)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0.01" max="0.99" step="0.01"
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                placeholder={impliedProb.toFixed(3)}
                className="w-full px-3 py-2.5 rounded-xl text-[15px] font-mono outline-none"
                style={{ background: '#161b22', border: '1px solid #1f2937', color: 'var(--text)' }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                {limitPrice ? `${(parseFloat(limitPrice) * 100).toFixed(1)}¢` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Amount */}
        <div className="mb-4">
          <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#6b7280' }}>
            Amount (USDC)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px] font-mono" style={{ color: 'var(--text-tertiary)' }}>$</span>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7 pr-3 py-2.5 rounded-xl text-[15px] font-mono outline-none"
              style={{ background: '#161b22', border: `1px solid ${insufficientBalance ? 'rgba(220,38,38,0.5)' : '#1f2937'}`, color: 'var(--text)' }}
            />
          </div>
          {/* Quick amounts */}
          <div className="flex gap-1.5 mt-2">
            {[10, 25, 50, 100].map(v => (
              <button key={v} onClick={() => setAmount(String(v))}
                className="flex-1 py-1 rounded-md text-[12px] cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280' }}>
                ${v}
              </button>
            ))}
          </div>
        </div>

        {/* Preview */}
        {preview && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <div style={{ color: 'var(--text-tertiary)' }}>Avg price</div>
                <div className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{(preview.avgPrice * 100).toFixed(2)}¢</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-tertiary)' }}>Shares</div>
                <div className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{preview.shares.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-tertiary)' }}>Max return</div>
                <div className="font-mono font-semibold" style={{ color: 'var(--green)' }}>+${preview.potentialReturn.toFixed(2)}</div>
              </div>
              {preview.priceImpact > 0.1 && (
                <div>
                  <div style={{ color: 'var(--text-tertiary)' }}>Price impact</div>
                  <div className="font-mono font-semibold" style={{ color: preview.priceImpact > 2 ? 'var(--red)' : 'var(--text-secondary)' }}>
                    {preview.priceImpact.toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status message */}
        {statusMsg && (
          <div className="mb-3 text-[13px] px-3 py-2 rounded-lg" style={{
            background: status === 'success' ? 'rgba(5,150,80,0.1)' : 'rgba(220,38,38,0.1)',
            color: status === 'success' ? '#4ade80' : '#f87171',
          }}>
            {statusMsg}
          </div>
        )}

        {/* CTA */}
        {!authenticated ? (
          <button
            onClick={login}
            className="w-full py-3 rounded-xl font-semibold text-[15px] cursor-pointer transition-all"
            style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
          >
            Sign in to Trade
          </button>
        ) : insufficientBalance ? (
          <button
            onClick={async () => {
              // Privy fund wallet
              if (wallet) {
                try { await (wallet as any).fund?.({ chain: polygon }) } catch {}
              }
            }}
            className="w-full py-3 rounded-xl font-semibold text-[15px] cursor-pointer transition-all"
            style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.3)' }}
          >
            Fund Wallet — Need ${(parseFloat(amount || '0') - (usdcBalance ?? 0)).toFixed(2)} more USDC
          </button>
        ) : (
          <button
            onClick={handleTrade}
            disabled={status === 'loading' || !preview}
            className="w-full py-3 rounded-xl font-semibold text-[15px] cursor-pointer transition-all disabled:opacity-50"
            style={{
              background: outcome === 'YES' ? 'rgba(5,150,80,0.85)' : 'rgba(220,38,38,0.75)',
              color: '#fff',
              border: 'none',
            }}
          >
            {status === 'loading' ? 'Placing order…' : `Buy ${outcome} ${preview ? `— ${preview.shares.toFixed(1)} shares` : ''}`}
          </button>
        )}

        {!bond.clobTokenIds && (
          <p className="text-center text-[12px] mt-3" style={{ color: 'var(--text-tertiary)' }}>
            This market is not available for CLOB trading
          </p>
        )}
      </div>
    </div>
  )
}
