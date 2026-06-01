"use client";

// Live order book for a single CLOB token, driven by the Polymarket market
// WebSocket channel. Replaces the old 2s REST poll in TradePanel: the panel
// passes the active outcome's token id, this hook subscribes while mounted and
// streams updates. It outputs the same `OrderBook` shape the rest of the app
// consumes (asks DESC / bids ASC), so nothing downstream changes.
//
// Resilience: instant REST seed for first paint, PING/PONG heartbeat with a
// staleness watchdog (catches silently-dead sockets that never fire onclose),
// capped-backoff reconnect, rAF-coalesced renders, and a slow REST fallback
// poll while the socket is not live so we never regress below the old behavior.

import { useEffect, useState } from "react";
import { CLOB_URL, type OrderBook } from "@/lib/polymarket";
import {
  createBookState,
  seedMeta,
  applyRestLadders,
  applyEvent,
  materialize,
  type WsEvent,
} from "@/lib/orderBookStream";

const MARKET_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const PING_INTERVAL_MS = 10_000;
const STALE_TIMEOUT_MS = 25_000; // no message (not even a PONG) → socket is dead
const FALLBACK_POLL_MS = 4_000; // REST refresh cadence while not live
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 10_000;

export type OrderBookStatus = "idle" | "connecting" | "live" | "reconnecting";

export interface UseOrderBookStreamResult {
  book: OrderBook | null;
  status: OrderBookStatus;
}

export function useOrderBookStream(tokenId: string | undefined): UseOrderBookStreamResult {
  const [book, setBook] = useState<OrderBook | null>(null);
  const [status, setStatus] = useState<OrderBookStatus>("idle");

  useEffect(() => {
    if (!tokenId) {
      setBook(null);
      setStatus("idle");
      return;
    }

    // All state below is scoped to THIS effect run (one tokenId). A token change
    // or unmount re-runs the effect and fires cleanup, tearing everything down —
    // so closure-scoped vars + a `closed` guard are sufficient (no shared refs).
    const state = createBookState();
    let closed = false;
    let live = false; // ≥1 WS data message received for this token
    let socket: WebSocket | null = null;
    let attempts = 0;
    let lastMsgAt = Date.now();
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId: number | null = null;
    let dirty = false;

    // ── Render coalescing: many price_change events per frame → one setBook ──
    const flush = () => {
      rafId = null;
      if (closed || !dirty) return;
      dirty = false;
      setBook(materialize(state));
    };
    const scheduleFlush = () => {
      dirty = true;
      if (rafId != null) return;
      rafId =
        typeof requestAnimationFrame === "function"
          ? requestAnimationFrame(flush)
          : (flush(), null);
    };
    const flushNow = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      flush();
    };
    const paint = () => {
      if (!closed) setBook(materialize(state));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") flushNow();
    };

    // ── REST seed / fallback refresh ───────────────────────────────────────
    const seedFromRest = async () => {
      try {
        const [bookRes, feeRes] = await Promise.all([
          fetch(`${CLOB_URL}/book?token_id=${tokenId}`, { cache: "no-store" }),
          fetch(`${CLOB_URL}/fee-rate?token_id=${tokenId}`, { cache: "no-store" }),
        ]);
        if (closed || !bookRes.ok) return;
        const raw = await bookRes.json();
        const fee = feeRes.ok ? await feeRes.json().catch(() => null) : null;
        const baseFee = Number(fee?.base_fee);
        if (closed) return;
        // base_fee / min_order_size / tick_size come only from REST. Apply them
        // unconditionally (set-if-unset) even if we've gone live in the meantime.
        seedMeta(state, {
          base_fee: Number.isFinite(baseFee) ? baseFee : undefined,
          min_order_size: raw.min_order_size,
          tick_size: raw.tick_size,
        });
        // Ladders are only REST-owned while the WS isn't the live source — never
        // clobber live WS depth with a REST response that resolved late.
        if (!live) {
          applyRestLadders(state, {
            bids: raw.bids,
            asks: raw.asks,
            last_trade_price: raw.last_trade_price,
          });
        }
        paint();
      } catch {
        /* ignore — the WS or a later poll will populate */
      }
    };

    // ── Socket lifecycle helpers ───────────────────────────────────────────
    const clearHeartbeat = () => {
      if (heartbeat != null) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    };
    // Detach handlers + clear heartbeat, returning the socket so the caller can
    // decide whether to close it. Nulling handlers first prevents a subsequent
    // close() from firing onclose (which would double-schedule a reconnect).
    const detachSocket = (): WebSocket | null => {
      clearHeartbeat();
      const s = socket;
      socket = null;
      if (s) {
        s.onopen = null;
        s.onmessage = null;
        s.onclose = null;
        s.onerror = null;
      }
      return s;
    };
    const closeSocket = () => {
      const s = detachSocket();
      if (s) {
        try {
          s.close();
        } catch {
          /* already closing */
        }
      }
    };

    const scheduleReconnect = () => {
      if (closed || reconnectTimer != null) return;
      live = false;
      setStatus("reconnecting");
      const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempts);
      const jitter = backoff * (0.8 + Math.random() * 0.4); // ±20% to avoid sync
      attempts++;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, jitter);
    };

    const connect = () => {
      if (closed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(MARKET_WS_URL);
      } catch {
        scheduleReconnect();
        return;
      }
      socket = ws;
      lastMsgAt = Date.now();

      ws.onopen = () => {
        if (closed || socket !== ws) return;
        lastMsgAt = Date.now();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ assets_ids: [tokenId], type: "market", custom_feature_enabled: true }),
          );
        }
        clearHeartbeat();
        heartbeat = setInterval(() => {
          if (closed || socket !== ws) return;
          if (Date.now() - lastMsgAt > STALE_TIMEOUT_MS) {
            // Silently dead socket — onclose never came. Force a clean reconnect.
            closeSocket();
            scheduleReconnect();
            return;
          }
          if (ws.readyState === WebSocket.OPEN) ws.send("PING");
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (e) => {
        if (closed || socket !== ws) return;
        lastMsgAt = Date.now();
        const data = e.data;
        if (typeof data !== "string" || data.length === 0 || data === "PONG") return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          return; // non-JSON keepalive / control frame
        }
        const events = Array.isArray(parsed) ? (parsed as WsEvent[]) : [parsed as WsEvent];
        let changed = false;
        for (const ev of events) {
          if (ev && typeof ev === "object" && applyEvent(state, ev, tokenId)) changed = true;
        }
        if (!changed) return;
        if (!live) {
          live = true;
          attempts = 0; // healthy connection — reset backoff
          setStatus("live");
        }
        scheduleFlush();
      };

      ws.onclose = () => {
        if (closed || socket !== ws) return;
        detachSocket();
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (closed || socket !== ws) return;
        // onerror is normally followed by onclose (which drives reconnect); only
        // act here if the socket is already fully closed.
        if (ws.readyState === WebSocket.CLOSED) {
          detachSocket();
          scheduleReconnect();
        }
      };
    };

    // ── Kick off ───────────────────────────────────────────────────────────
    setBook(null); // clear the previous token's book (shows "Loading…" briefly)
    setStatus("connecting");
    void seedFromRest();
    connect();

    // No-regression fallback: refresh via REST while we don't have a live socket.
    const fallbackPoll = setInterval(() => {
      if (!closed && !live) void seedFromRest();
    }, FALLBACK_POLL_MS);

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      closed = true;
      closeSocket();
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      clearInterval(fallbackPoll);
      if (rafId != null) cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tokenId]);

  return { book, status };
}
