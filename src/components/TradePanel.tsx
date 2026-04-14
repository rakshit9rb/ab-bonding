'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom } from 'viem'
import { polygon } from 'viem/chains'
import { Bond, fmtVolume } from '@/lib/bonds'
import { CLOB_URL, calcMarketPreview, signAndPlaceOrder, getUsdcBalance, OrderBook, OrderPreview, OrderType } from '@/lib/polymarket'

interface Props { bond: Bond; onClose: () => void }
type Outcome = 'YES' | 'NO'

function OrderBookDisplay({ book, outcome }: { book: OrderBook; outcome: Outcome }) {
  const asks = [...(book.asks ?? [])].slice(0, 8).reverse()
  const bids = (book.bids ?? []).slice(0, 8)
  const maxSize = Math.max(...[...asks, ...bids].map(l => parseFloat(l.size) || 0), 1)

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-3 text-[10px] font-semibold uppercase tracking-wider pb-1 mb-1" style={{ color: '#4b5563', borderBottom: '1px solid #1f2937' }}>
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      {/* Asks (sell side) */}
      <div className="flex flex-col gap-[2px] mb-1">
        {asks.map((ask, i) => {
          const pct = (parseFloat(ask.size) / maxSize) * 100
          return (
            <div key={i} className="relative grid grid-cols-3 text-[11px] font-mono py-[2px] px-1 rounded-sm overflow-hidden">
              <div className="absolute inset-0 right-0" style={{ background: `rgba(220,38,38,0.12)`, width: `${pct}%`, left: 'auto' }} />
              <span className="relative" style={{ color: '#f87171' }}>{(parseFloat(ask.price) * 100).toFixed(1)}¢</span>
              <span className="relative text-right" style={{ color: '#9ca3af' }}>{parseFloat(ask.size).toFixed(0)}</span>
              <span className="relative text-right" style={{ color: '#6b7280' }}>${(parseFloat(ask.price) * parseFloat(ask.size)).toFixed(0)}</span>
            </div>
          )
        })}
      </div>

      {/* Spread */}
      {book.asks?.[0] && book.bids?.[0] && (
        <div className="text-center text-[10px] py-1 my-0.5" style={{ color: '#4b5563', borderTop: '1px solid #1f2937', borderBottom: '1px solid #1f2937' }}>
          Spread {((parseFloat(book.asks[0].price) - parseFloat(book.bids[0].price)) * 100).toFixed(1)}¢
        </div>
      )}

      {/* Bids (buy side) */}
      <div className="flex flex-col gap-[2px] mt-1">
        {bids.map((bid, i) => {
          const pct = (parseFloat(bid.size) / maxSize) * 100
          return (
            <div key={i} className="relative grid grid-cols-3 text-[11px] font-mono py-[2px] px-1 rounded-sm overflow-hidden">
              <div className="absolute inset-0" style={{ background: `rgba(5,150,80,0.12)`, width: `${pct}%` }} />
              <span className="relative" style={{ color: '#4ade80' }}>{(parseFloat(bid.price) * 100).toFixed(1)}¢</span>
              <span className="relative text-right" style={{ color: '#9ca3af' }}>{parseFloat(bid.size).toFixed(0)}</span>
              <span className="relative text-right" style={{ color: '#6b7280' }}>${(parseFloat(bid.price) * parseFloat(bid.size)).toFixed(0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function TradePanel({ bond, onClose }: Props) {
  const { authenticated, login } = usePrivy()
  const { wallets } = useWallets()

  const [outcome, setOutcome] = useState<Outcome>('YES')
  const [orderType, setOrderType] = useState<OrderType>('FOK')
  const [amount, setAmount] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [book, setBook] = useState<OrderBook | null>(null)
  const [preview, setPreview] = useState<OrderPreview | null>(null)
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')

  const wallet = wallets[0]
  const tokenId = outcome === 'YES' ? bond.clobTokenIds?.[0] : bond.clobTokenIds?.[1]
  const bestAsk = book?.asks?.[0] ? parseFloat(book.asks[0].price) : null
  const bestBid = book?.bids?.[0] ? parseFloat(book.bids[0].price) : null
  const midPrice = bestAsk && bestBid ? (bestAsk + bestBid) / 2 : bond.price

  useEffect(() => {
    if (!tokenId) return
    const load = () =>
      fetch(`${CLOB_URL}/book?token_id=${tokenId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => data && setBook(data))
        .catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [tokenId])

  useEffect(() => {
    if (!wallet?.address) return
    getUsdcBalance(wallet.address).then(setUsdcBalance)
  }, [wallet?.address])

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
    if (!wallet || !tokenId || !preview) return
    setStatus('loading'); setStatusMsg('')
    try {
      const provider = await wallet.getEthereumProvider()
      const walletClient = createWalletClient({ chain: polygon, transport: custom(provider) })
      const price = orderType === 'FOK' ? preview.avgPrice : parseFloat(limitPrice)
      const result = await signAndPlaceOrder({
        walletClient, address: wallet.address, tokenId,
        side: 'BUY', orderType, price, size: preview.shares, negRisk: bond.negRisk,
      })
      if (result.success) {
        setStatus('success')
        setStatusMsg(`Order placed!`)
        setAmount('')
        getUsdcBalance(wallet.address).then(setUsdcBalance)
      } else {
        setStatus('error')
        setStatusMsg(result.error ?? 'Order failed')
      }
    } catch (e: any) {
      setStatus('error')
      setStatusMsg(e?.message ?? 'Unknown error')
    }
  }, [authenticated, login, wallet, tokenId, preview, orderType, limitPrice, bond.negRisk])

  const usdc = parseFloat(amount || '0')
  const insufficientBalance = usdcBalance !== null && usdc > usdcBalance

  return (
    <div
      className="col-span-full overflow-hidden transition-all"
      style={{ borderBottom: '1px solid var(--border)', background: '#0d1117' }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0">

        {/* Order Book */}
        <div className="p-4 border-r" style={{ borderColor: '#1f2937' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#4b5563' }}>Order Book</span>
            <div className="flex items-center gap-3 text-[12px] font-mono">
              <span style={{ color: '#4ade80' }}>B {bestBid ? (bestBid * 100).toFixed(1) : '—'}¢</span>
              <span style={{ color: '#f87171' }}>A {bestAsk ? (bestAsk * 100).toFixed(1) : '—'}¢</span>
              <span style={{ color: '#6b7280' }}>Mid {(midPrice * 100).toFixed(1)}¢</span>
            </div>
          </div>
          {book ? (
            <OrderBookDisplay book={book} outcome={outcome} />
          ) : (
            <div className="flex items-center justify-center h-32 text-[13px]" style={{ color: '#4b5563' }}>
              Loading order book…
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 pt-3 text-[12px]" style={{ borderTop: '1px solid #1f2937', color: '#4b5563' }}>
            <span>Vol {fmtVolume(bond.volume)}</span>
            <span>Liq {fmtVolume(bond.liquidity)}</span>
          </div>
        </div>

        {/* Trade Form */}
        <div className="p-4 flex flex-col gap-3">

          {/* Header + close */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#4b5563' }}>Place Order</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>

          {/* Balance */}
          {usdcBalance !== null && (
            <div className="text-[12px] text-right" style={{ color: '#6b7280' }}>
              Balance: <span className="font-mono" style={{ color: '#9ca3af' }}>${usdcBalance.toFixed(2)} USDC</span>
            </div>
          )}

          {/* YES / NO */}
          <div className="grid grid-cols-2 gap-1.5">
            {(['YES', 'NO'] as Outcome[]).map(o => (
              <button key={o} onClick={() => setOutcome(o)}
                className="py-2 rounded-lg font-semibold text-[13px] cursor-pointer transition-all"
                style={{
                  background: outcome === o ? (o === 'YES' ? 'rgba(5,150,80,0.25)' : 'rgba(220,38,38,0.2)') : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${outcome === o ? (o === 'YES' ? 'rgba(5,150,80,0.6)' : 'rgba(220,38,38,0.5)') : '#1f2937'}`,
                  color: outcome === o ? (o === 'YES' ? '#4ade80' : '#f87171') : '#4b5563',
                }}
              >
                {o} {o === 'YES' && bestAsk ? `${(bestAsk * 100).toFixed(0)}¢` : o === 'NO' && bestBid ? `${((1 - bestBid) * 100).toFixed(0)}¢` : ''}
              </button>
            ))}
          </div>

          {/* Market / Limit */}
          <div className="grid grid-cols-2 gap-1.5">
            {([{ v: 'FOK' as OrderType, l: 'Market' }, { v: 'GTC' as OrderType, l: 'Limit' }]).map(o => (
              <button key={o.v} onClick={() => setOrderType(o.v)}
                className="py-1.5 rounded-md text-[12px] cursor-pointer transition-all"
                style={{
                  background: orderType === o.v ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: `1px solid ${orderType === o.v ? '#374151' : '#1f2937'}`,
                  color: orderType === o.v ? '#9ca3af' : '#4b5563',
                }}
              >
                {o.l}
              </button>
            ))}
          </div>

          {/* Limit price */}
          {orderType === 'GTC' && (
            <div className="relative">
              <input type="number" min="0.01" max="0.99" step="0.01"
                value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                placeholder={`Price (e.g. ${midPrice.toFixed(2)})`}
                className="w-full px-3 py-2 rounded-lg text-[13px] font-mono outline-none"
                style={{ background: '#161b22', border: '1px solid #1f2937', color: '#e5e7eb' }}
              />
            </div>
          )}

          {/* Amount */}
          <div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-mono" style={{ color: '#4b5563' }}>$</span>
              <input type="number" min="1"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Amount"
                className="w-full pl-6 pr-3 py-2 rounded-lg text-[13px] font-mono outline-none"
                style={{ background: '#161b22', border: `1px solid ${insufficientBalance ? 'rgba(220,38,38,0.4)' : '#1f2937'}`, color: '#e5e7eb' }}
              />
            </div>
            <div className="flex gap-1 mt-1.5">
              {[10, 25, 50, 100].map(v => (
                <button key={v} onClick={() => setAmount(String(v))}
                  className="flex-1 py-1 rounded text-[11px] cursor-pointer transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1f2937', color: '#4b5563' }}>
                  ${v}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="rounded-lg p-2.5 text-[12px] font-mono" style={{ background: '#161b22', border: '1px solid #1f2937' }}>
              <div className="flex justify-between mb-1">
                <span style={{ color: '#6b7280' }}>Avg price</span>
                <span style={{ color: '#e5e7eb' }}>{(preview.avgPrice * 100).toFixed(2)}¢</span>
              </div>
              <div className="flex justify-between mb-1">
                <span style={{ color: '#6b7280' }}>Shares</span>
                <span style={{ color: '#e5e7eb' }}>{preview.shares.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#6b7280' }}>Max profit</span>
                <span style={{ color: '#4ade80' }}>+${preview.potentialReturn.toFixed(2)}</span>
              </div>
              {preview.priceImpact > 0.5 && (
                <div className="flex justify-between mt-1">
                  <span style={{ color: '#6b7280' }}>Impact</span>
                  <span style={{ color: preview.priceImpact > 2 ? '#f87171' : '#fbbf24' }}>{preview.priceImpact.toFixed(2)}%</span>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          {statusMsg && (
            <div className="text-[12px] px-2.5 py-1.5 rounded-lg" style={{
              background: status === 'success' ? 'rgba(5,150,80,0.1)' : 'rgba(220,38,38,0.1)',
              color: status === 'success' ? '#4ade80' : '#f87171',
            }}>
              {statusMsg}
            </div>
          )}

          {/* CTA */}
          {!authenticated ? (
            <button onClick={login}
              className="w-full py-2.5 rounded-lg font-semibold text-[14px] cursor-pointer transition-all"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
              Sign in to Trade
            </button>
          ) : insufficientBalance ? (
            <button
              onClick={async () => { try { await (wallet as any).fund?.() } catch {} }}
              className="w-full py-2.5 rounded-lg font-semibold text-[13px] cursor-pointer"
              style={{ background: 'rgba(234,179,8,0.12)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.25)' }}>
              Fund Wallet
            </button>
          ) : (
            <button onClick={handleTrade}
              disabled={status === 'loading' || !preview}
              className="w-full py-2.5 rounded-lg font-semibold text-[14px] cursor-pointer transition-all disabled:opacity-40"
              style={{
                background: outcome === 'YES' ? '#059650' : '#dc2626',
                color: '#fff', border: 'none',
              }}>
              {status === 'loading' ? 'Placing…' : `Buy ${outcome}${preview ? ` · ${preview.shares.toFixed(1)} shares` : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
