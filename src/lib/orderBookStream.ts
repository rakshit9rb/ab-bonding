// Pure, React-free order-book state machine for the Polymarket market WS channel.
//
// The CLOB market channel (wss://ws-subscriptions-clob.polymarket.com/ws/market)
// pushes a full `book` snapshot on subscribe, then incremental `price_change`
// updates. This module folds those events into a canonical `OrderBook` (the same
// shape `TradePanel` already consumes), so all downstream code — order-book
// display, best bid/ask, and the buy/sell previews — works unchanged.
//
// Kept free of React/browser APIs so the folding logic can be unit-tested in
// isolation (see the verification notes in the implementation plan).

import type { OrderBook } from "@/lib/polymarket";

export interface RawLevel {
  price: string;
  size: string;
}

export interface BookSnapshot {
  event_type?: string;
  asset_id?: string;
  bids?: RawLevel[];
  asks?: RawLevel[];
  tick_size?: string;
  last_trade_price?: string;
}

export interface PriceChangeItem {
  asset_id: string;
  price: string;
  size: string;
  side: string; // "BUY" (bid) | "SELL" (ask)
}

export interface PriceChangeEvent {
  event_type?: string;
  price_changes?: PriceChangeItem[];
}

export interface LastTradeEvent {
  event_type?: string;
  asset_id?: string;
  price?: string;
}

export interface TickSizeEvent {
  event_type?: string;
  asset_id?: string;
  new_tick_size?: string;
}

export type WsEvent = { event_type?: string } & Record<string, unknown>;

// Fields that live ONLY in `meta`: seeded once from REST and preserved for the
// lifetime of the connection (including across reconnects). WS events never
// supply `base_fee`/`min_order_size`, and `tick_size` only changes via the
// dedicated `tick_size_change` event — so a periodic `book` snapshot must never
// clobber them.
export interface BookMeta {
  base_fee?: number;
  min_order_size?: string;
  tick_size?: string;
  last_trade_price?: string;
}

export interface BookState {
  bids: Map<string, string>; // priceKey -> size
  asks: Map<string, string>; // priceKey -> size
  meta: BookMeta;
}

export interface RestSeed {
  bids?: RawLevel[];
  asks?: RawLevel[];
  tick_size?: string;
  min_order_size?: string;
  last_trade_price?: string;
  base_fee?: number;
}

export function createBookState(): BookState {
  return { bids: new Map(), asks: new Map(), meta: {} };
}

// Canonical price key. The finest Polymarket tick is 0.0001, so 4 decimals is
// lossless for any real price while unifying string variants ("0.10" vs "0.1").
// This guarantees a `size:"0"` removal hits the exact key inserted by the
// snapshot — otherwise a stale "ghost" level would survive and corrupt the best
// bid/ask. Returns null for non-numeric input (defensively skipped).
export function priceKey(price: string): string | null {
  const n = Number(price);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(4);
}

function isZeroSize(size: string): boolean {
  const n = Number(size);
  return !Number.isFinite(n) || n === 0;
}

function rebuild(map: Map<string, string>, levels: RawLevel[] | undefined): void {
  map.clear();
  if (!levels) return;
  for (const lvl of levels) {
    const k = priceKey(lvl.price);
    if (k === null || isZeroSize(lvl.size)) continue;
    map.set(k, lvl.size);
  }
}

// Connection-lifetime constants (base_fee, min_order_size) plus the initial
// tick-size come ONLY from REST. Set-if-unset so a REST response that resolves
// *after* the WS has already gone live can still fill in base_fee without
// disturbing anything already known (the WS ladders, a tick_size_change, etc.).
export function seedMeta(
  state: BookState,
  seed: Pick<RestSeed, "base_fee" | "min_order_size" | "tick_size">,
): void {
  if (seed.base_fee != null && state.meta.base_fee == null) state.meta.base_fee = seed.base_fee;
  if (seed.min_order_size != null && state.meta.min_order_size == null) {
    state.meta.min_order_size = seed.min_order_size;
  }
  if (seed.tick_size != null && state.meta.tick_size == null) state.meta.tick_size = seed.tick_size;
}

// Replace both ladders from a REST snapshot. Used for the initial paint and as
// the fallback refresh while the WS is not the live source of truth.
export function applyRestLadders(
  state: BookState,
  seed: Pick<RestSeed, "bids" | "asks" | "last_trade_price">,
): void {
  rebuild(state.bids, seed.bids);
  rebuild(state.asks, seed.asks);
  if (seed.last_trade_price != null) state.meta.last_trade_price = seed.last_trade_price;
}

export function applyRestSeed(state: BookState, seed: RestSeed): void {
  seedMeta(state, seed);
  applyRestLadders(state, seed);
}

// Full snapshot: replaces both ladders. Updates last price, but only *seeds*
// tick size if still unknown (never overwrites a known one — that is what
// tick_size_change is for) and never touches base_fee/min_order_size.
export function applyBookSnapshot(state: BookState, ev: BookSnapshot): void {
  rebuild(state.bids, ev.bids);
  rebuild(state.asks, ev.asks);
  if (ev.last_trade_price != null) state.meta.last_trade_price = ev.last_trade_price;
  if (ev.tick_size != null && state.meta.tick_size == null) {
    state.meta.tick_size = ev.tick_size;
  }
}

// Incremental L2 deltas. One message can carry changes for BOTH tokens of a
// market, so every change is filtered by asset_id. size "0" removes the level.
// Returns whether our token's ladder actually changed.
export function applyPriceChange(state: BookState, ev: PriceChangeEvent, tokenId: string): boolean {
  const changes = ev.price_changes;
  if (!changes || changes.length === 0) return false;
  let mutated = false;
  for (const c of changes) {
    if (c.asset_id !== tokenId) continue;
    const k = priceKey(c.price);
    if (k === null) continue;
    const side = String(c.side).toUpperCase();
    const map = side === "BUY" ? state.bids : side === "SELL" ? state.asks : null;
    if (!map) continue;
    if (isZeroSize(c.size)) map.delete(k);
    else map.set(k, c.size);
    mutated = true;
  }
  return mutated;
}

export function applyLastTrade(state: BookState, ev: LastTradeEvent, tokenId: string): boolean {
  if (ev.asset_id !== tokenId || ev.price == null) return false;
  state.meta.last_trade_price = ev.price;
  return true;
}

export function applyTickSize(state: BookState, ev: TickSizeEvent, tokenId: string): boolean {
  if (ev.asset_id !== tokenId || ev.new_tick_size == null) return false;
  state.meta.tick_size = ev.new_tick_size;
  return true;
}

// Route a parsed WS event to the right fold. Returns true if it changed state
// for `tokenId` (so the caller can skip a re-render when nothing relevant moved).
export function applyEvent(state: BookState, ev: WsEvent, tokenId: string): boolean {
  switch (ev.event_type) {
    case "book": {
      const snap = ev as BookSnapshot;
      if (snap.asset_id && snap.asset_id !== tokenId) return false;
      applyBookSnapshot(state, snap);
      return true;
    }
    case "price_change":
      return applyPriceChange(state, ev as PriceChangeEvent, tokenId);
    case "last_trade_price":
      return applyLastTrade(state, ev as LastTradeEvent, tokenId);
    case "tick_size_change":
      return applyTickSize(state, ev as TickSizeEvent, tokenId);
    default:
      return false;
  }
}

// Render the Maps into the canonical OrderBook the rest of the app expects:
// asks DESC by price (best/lowest ask LAST), bids ASC (best/highest bid LAST) —
// matching the REST `/book` ordering that OrderBookDisplay, calcMarketPreview
// and calcSellPreview rely on. Comparators are numeric, never lexicographic.
export function materialize(state: BookState): OrderBook {
  const asks = [...state.asks.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  const bids = [...state.bids.entries()]
    .map(([price, size]) => ({ price, size }))
    .sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  return { bids, asks, ...state.meta };
}
