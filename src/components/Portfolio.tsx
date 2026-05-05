"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import { getUsdcBalance, transferUsdcSponsored } from "@/lib/polymarket";
import { ensureWalletOnPolygon, getPrimaryWallet } from "@/lib/privyWallet";
import {
  DepositWalletInfo,
  fetchDepositWalletInfo,
  requestDepositWalletDeploy,
} from "@/lib/polymarketDepositWalletClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Position {
  asset: string;
  conditionId: string;
  title: string;
  outcome: string;
  slug: string;
  eventSlug: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  initialValue: number;
  totalBought: number;
  redeemable: boolean;
  endDate: string;
}

interface Activity {
  id: string;
  timestamp: number;
  title: string;
  slug: string;
  outcome: string;
  side: string; // 'BUY' | 'SELL'
  size: number;
  price: number;
  usdcSize: number;
  type: string;
  outcome_index?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return "$" + n.toFixed(2);
}

function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PnlBadge({ value, pct }: { value: number; pct?: number }) {
  const pos = value >= 0;
  return (
    <span className="font-mono font-semibold" style={{ color: pos ? "#4ade80" : "#f87171" }}>
      {fmt$(value)}
      {pct != null ? ` (${fmtPct(pct)})` : ""}
    </span>
  );
}

// ─── Funds Panel ─────────────────────────────────────────────────────────────

function FundsPanel({
  address,
  depositWallet,
  wallet,
  connectedPusdBalance,
  tradingPusdBalance,
  onDeployWallet,
  onBalanceRefresh,
}: {
  address: string;
  depositWallet: DepositWalletInfo | null;
  wallet: ConnectedWallet;
  connectedPusdBalance: number | null;
  tradingPusdBalance: number | null;
  onDeployWallet: () => Promise<void>;
  onBalanceRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [moveAmount, setMoveAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [txMsg, setTxMsg] = useState("");
  const [deployStatus, setDeployStatus] = useState<"idle" | "loading" | "error">("idle");
  const { sendTransaction } = useSendTransaction();
  const fundingAddress = depositWallet?.address ?? address;
  const moveNum = parseFloat(moveAmount || "0");
  const insufficientConnectedPusd =
    connectedPusdBalance !== null && moveNum > 0 && moveNum > connectedPusdBalance;

  const copy = () => {
    navigator.clipboard.writeText(fundingAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDeploy = async () => {
    setDeployStatus("loading");
    setTxMsg("");
    try {
      await onDeployWallet();
      setDeployStatus("idle");
    } catch (e: any) {
      setDeployStatus("error");
      setTxMsg(e?.message ?? "Could not deploy trading wallet");
    }
  };

  const handleMove = async () => {
    if (!wallet || !depositWallet?.address || !depositWallet.deployed) return;
    if (isNaN(moveNum) || moveNum <= 0 || insufficientConnectedPusd) return;
    setTxStatus("loading");
    setTxMsg("");
    try {
      await ensureWalletOnPolygon(wallet);
      const rawAmt = BigInt(Math.round(moveNum * 1_000_000));
      const result = await transferUsdcSponsored({
        sendTransaction,
        address,
        to: depositWallet.address,
        amount: rawAmt,
      });
      if (!result.success) throw new Error(result.error ?? "Transaction failed");
      setTxStatus("success");
      setTxMsg(`Moved $${moveNum.toFixed(2)} to trading wallet`);
      setMoveAmount("");
      setTimeout(onBalanceRefresh, 3000);
    } catch (e: any) {
      setTxStatus("error");
      setTxMsg(e?.message ?? "Transaction failed");
    }
  };

  return (
    <div
      className="rounded-xl mb-6 overflow-hidden"
      style={{ background: "#161b22", border: "1px solid #1f2937" }}
    >
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div
              className="text-[11px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: "#6b7280" }}
            >
              Polymarket trading wallet
            </div>
            <div className="text-[13px]" style={{ color: "#9ca3af" }}>
              Deposits, open positions, and trade history are tied to this deposit wallet.
            </div>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <div className="text-[11px]" style={{ color: "#6b7280" }}>
                Trading
              </div>
              <div
                className="text-[16px] font-mono font-bold"
                style={{ color: (tradingPusdBalance ?? 0) > 0 ? "#4ade80" : "#9ca3af" }}
              >
                {tradingPusdBalance !== null ? `$${tradingPusdBalance.toFixed(2)}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px]" style={{ color: "#6b7280" }}>
                Connected
              </div>
              <div className="text-[16px] font-mono font-bold" style={{ color: "#9ca3af" }}>
                {connectedPusdBalance !== null ? `$${connectedPusdBalance.toFixed(2)}` : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <code
            className="flex-1 text-[12px] font-mono px-3 py-2.5 rounded-lg truncate"
            style={{
              background: "#0d1117",
              border: "1px solid #374151",
              color: "#9ca3af",
            }}
          >
            {fundingAddress}
          </code>
          <button
            onClick={copy}
            className="px-4 py-2.5 rounded-lg text-[13px] font-semibold cursor-pointer shrink-0 transition-all"
            style={{
              background: copied ? "rgba(5,150,80,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${copied ? "rgba(5,150,80,0.3)" : "#374151"}`,
              color: copied ? "#4ade80" : "#9ca3af",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {!depositWallet?.deployed && (
          <button
            onClick={handleDeploy}
            disabled={deployStatus === "loading"}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold cursor-pointer disabled:opacity-50 mb-3"
            style={{
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.3)",
              color: "#60a5fa",
            }}
          >
            {deployStatus === "loading" ? "Deploying trading wallet…" : "Deploy trading wallet"}
          </button>
        )}

        <div
          className="rounded-lg p-3"
          style={{ background: "#0d1117", border: "1px solid #374151" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold" style={{ color: "#9ca3af" }}>
              Move pUSD from connected wallet
            </span>
            {connectedPusdBalance !== null && connectedPusdBalance > 0 && (
              <button
                onClick={() => setMoveAmount(connectedPusdBalance.toFixed(2))}
                className="text-[12px] font-mono cursor-pointer bg-transparent border-none p-0"
                style={{ color: "#60a5fa" }}
              >
                Max ${connectedPusdBalance.toFixed(2)}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={moveAmount}
              onChange={(e) => setMoveAmount(e.target.value)}
              placeholder="Amount"
              type="number"
              min="0"
              className="flex-1 min-w-0 px-3 py-2.5 rounded-lg text-[13px] font-mono outline-none"
              style={{
                background: "#161b22",
                border: `1px solid ${insufficientConnectedPusd ? "rgba(220,38,38,0.4)" : "#374151"}`,
                color: "#e5e7eb",
              }}
            />
            <button
              onClick={handleMove}
              disabled={
                txStatus === "loading" ||
                !moveNum ||
                insufficientConnectedPusd ||
                depositWallet?.deployed !== true
              }
              className="px-4 py-2.5 rounded-lg text-[13px] font-semibold cursor-pointer transition-all disabled:opacity-40"
              style={{
                background: "rgba(5,150,80,0.12)",
                border: "1px solid rgba(5,150,80,0.3)",
                color: "#4ade80",
              }}
            >
              {txStatus === "loading" ? "Moving…" : "Move"}
            </button>
          </div>
          <p className="text-[12px] mt-2" style={{ color: "#4b5563" }}>
            pUSD on the connected wallet is visible here, but CLOB orders only use the trading
            wallet balance.
          </p>
          {txMsg && (
            <div
              className="text-[12px] px-3 py-2 rounded-lg mt-2"
              style={{
                background: txStatus === "success" ? "rgba(5,150,80,0.1)" : "rgba(220,38,38,0.1)",
                color: txStatus === "success" ? "#4ade80" : "#f87171",
              }}
            >
              {txMsg}
            </div>
          )}
        </div>
        <p className="text-[12px] mt-3" style={{ color: "#4b5563" }}>
          Send pUSD on Polygon only to the trading wallet address above.
        </p>
      </div>
    </div>
  );
}

// ─── Summary Bar ─────────────────────────────────────────────────────────────

function SummaryBar({ positions }: { positions: Position[] }) {
  const totalInvested = positions.reduce((s, p) => s + p.totalBought, 0);
  const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);
  const totalPnl = positions.reduce((s, p) => s + p.cashPnl, 0);
  const open = positions.filter((p) => !p.redeemable).length;

  const stats = [
    { label: "Invested", value: fmt$(totalInvested), color: "var(--text)" },
    { label: "Current Value", value: fmt$(totalValue), color: "var(--text)" },
    {
      label: "Total PnL",
      value: fmt$(totalPnl),
      color: totalPnl >= 0 ? "#4ade80" : "#f87171",
    },
    { label: "Open Positions", value: String(open), color: "var(--text)" },
  ];

  return (
    <div
      className="rounded-xl p-5 mb-4 flex flex-wrap gap-8"
      style={{ background: "#161b22", border: "1px solid #1f2937" }}
    >
      {stats.map((s) => (
        <div key={s.label}>
          <div
            className="text-[11px] font-semibold uppercase tracking-wider mb-1"
            style={{ color: "#6b7280" }}
          >
            {s.label}
          </div>
          <div className="text-[22px] font-bold font-mono leading-none" style={{ color: s.color }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Positions Table ──────────────────────────────────────────────────────────

function PositionsTable({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <span className="text-[16px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          No open positions
        </span>
        <span className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>
          Your Polymarket positions will appear here
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "#6b7280", borderBottom: "1px solid #1f2937" }}
          >
            <th className="text-left pb-3 pr-4">Market</th>
            <th className="text-right pb-3 px-3">Outcome</th>
            <th className="text-right pb-3 px-3">Shares</th>
            <th className="text-right pb-3 px-3">Avg Price</th>
            <th className="text-right pb-3 px-3">Cur Price</th>
            <th className="text-right pb-3 px-3">Value</th>
            <th className="text-right pb-3 px-3">PnL</th>
            <th className="text-right pb-3 pl-3">Expiry</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr
              key={p.asset}
              style={{
                borderBottom: "1px solid #1f2937",
                opacity: p.redeemable ? 0.6 : 1,
              }}
            >
              <td className="py-3 pr-4">
                <a
                  href={`https://polymarket.com/event/${p.eventSlug}?via=onlybonds`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] font-medium hover:underline"
                  style={{ color: "var(--text)", textDecoration: "none" }}
                >
                  <span className="line-clamp-2 max-w-[280px] block">{p.title}</span>
                </a>
                {p.redeemable && (
                  <span className="text-[11px] mt-0.5 block" style={{ color: "#fbbf24" }}>
                    Redeemable
                  </span>
                )}
              </td>
              <td className="py-3 px-3 text-right">
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-semibold"
                  style={{
                    background:
                      p.outcome.toLowerCase() === "yes" || p.curPrice > 0.5
                        ? "rgba(5,150,80,0.15)"
                        : "rgba(220,38,38,0.1)",
                    color:
                      p.outcome.toLowerCase() === "yes" || p.curPrice > 0.5 ? "#4ade80" : "#f87171",
                  }}
                >
                  {p.outcome}
                </span>
              </td>
              <td
                className="py-3 px-3 text-right font-mono"
                style={{ color: "var(--text-secondary)" }}
              >
                {p.size.toFixed(2)}
              </td>
              <td
                className="py-3 px-3 text-right font-mono"
                style={{ color: "var(--text-secondary)" }}
              >
                {p.avgPrice > 0 ? (p.avgPrice * 100).toFixed(1) + "¢" : "—"}
              </td>
              <td className="py-3 px-3 text-right font-mono" style={{ color: "var(--text)" }}>
                {(p.curPrice * 100).toFixed(1)}¢
              </td>
              <td className="py-3 px-3 text-right font-mono" style={{ color: "var(--text)" }}>
                {fmt$(p.currentValue)}
              </td>
              <td className="py-3 px-3 text-right">
                <PnlBadge value={p.cashPnl} pct={p.percentPnl} />
              </td>
              <td
                className="py-3 pl-3 text-right font-mono text-[12px]"
                style={{ color: "#6b7280" }}
              >
                {p.endDate
                  ? new Date(p.endDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Activity Table ───────────────────────────────────────────────────────────

function ActivityTable({ address }: { address: string }) {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 50;

  const load = useCallback(
    async (off: number, append = false) => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://data-api.polymarket.com/activity?user=${address}&limit=${LIMIT}&offset=${off}`,
        );
        const data: Activity[] = await res.json();
        if (append) setActivity((prev) => [...prev, ...data]);
        else setActivity(data);
        setHasMore(data.length === LIMIT);
        setOffset(off + data.length);
      } catch {
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [address],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  if (loading && activity.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="text-[14px]" style={{ color: "#6b7280" }}>
          Loading history…
        </span>
      </div>
    );
  }

  if (!loading && activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <span className="text-[16px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          No trade history
        </span>
        <span className="text-[14px]" style={{ color: "var(--text-tertiary)" }}>
          Trades will appear here after you place orders
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "#6b7280", borderBottom: "1px solid #1f2937" }}
            >
              <th className="text-left pb-3 pr-4">Date</th>
              <th className="text-left pb-3 pr-4">Market</th>
              <th className="text-right pb-3 px-3">Side</th>
              <th className="text-right pb-3 px-3">Outcome</th>
              <th className="text-right pb-3 px-3">Shares</th>
              <th className="text-right pb-3 px-3">Price</th>
              <th className="text-right pb-3 pl-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a, i) => {
              const isBuy = a.side?.toUpperCase() === "BUY";
              const isWon = a.type === "REDEEM" || a.outcome?.toLowerCase() === "won";
              const isLost = a.outcome?.toLowerCase() === "lost";
              return (
                <tr key={a.id ?? i} style={{ borderBottom: "1px solid #1f2937" }}>
                  <td
                    className="py-3 pr-4 font-mono text-[12px] whitespace-nowrap"
                    style={{ color: "#6b7280" }}
                  >
                    {a.timestamp ? fmtDate(a.timestamp) : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className="line-clamp-1 max-w-[240px] block"
                      style={{ color: "var(--text)" }}
                    >
                      {a.title ?? "—"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span
                      className="px-2 py-0.5 rounded text-[11px] font-semibold"
                      style={{
                        background: isBuy ? "rgba(5,150,80,0.15)" : "rgba(220,38,38,0.1)",
                        color: isBuy ? "#4ade80" : "#f87171",
                      }}
                    >
                      {a.side ?? a.type ?? "—"}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {isWon ? (
                      <span style={{ color: "#4ade80" }} className="font-semibold text-[12px]">
                        Won ✓
                      </span>
                    ) : isLost ? (
                      <span style={{ color: "#f87171" }} className="font-semibold text-[12px]">
                        Lost ✗
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af" }} className="text-[12px]">
                        {a.outcome ?? "—"}
                      </span>
                    )}
                  </td>
                  <td
                    className="py-3 px-3 text-right font-mono"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {a.size?.toFixed(2) ?? "—"}
                  </td>
                  <td
                    className="py-3 px-3 text-right font-mono"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {a.price != null ? (a.price * 100).toFixed(1) + "¢" : "—"}
                  </td>
                  <td
                    className="py-3 pl-3 text-right font-mono font-semibold"
                    style={{ color: "var(--text)" }}
                  >
                    {a.usdcSize != null ? fmt$(a.usdcSize) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => load(offset, true)}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-all disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid #1f2937",
              color: "#9ca3af",
            }}
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "positions" | "history";

export default function Portfolio() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [tradingUsdcBalance, setTradingUsdcBalance] = useState<number | null>(null);
  const [depositWallet, setDepositWallet] = useState<DepositWalletInfo | null>(null);
  const [tab, setTab] = useState<Tab>("positions");

  const wallet = useMemo(
    () => (walletsReady ? getPrimaryWallet(wallets) : null),
    [wallets, walletsReady],
  );
  const address = wallet?.address;
  const portfolioAddress = depositWallet?.address ?? address;

  const refreshBalances = useCallback(async () => {
    if (!address) {
      setUsdcBalance(null);
      setTradingUsdcBalance(null);
      return;
    }
    const [connected, trading] = await Promise.all([
      getUsdcBalance(address),
      depositWallet?.address ? getUsdcBalance(depositWallet.address) : Promise.resolve(null),
    ]);
    setUsdcBalance(connected);
    setTradingUsdcBalance(trading);
  }, [address, depositWallet?.address]);

  const handleDeployDepositWallet = useCallback(async () => {
    if (!address) return;
    const next = await requestDepositWalletDeploy(address);
    setDepositWallet(next);
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    fetchDepositWalletInfo(address)
      .then((data) => {
        if (!cancelled) setDepositWallet(data);
      })
      .catch(() => {
        if (!cancelled) setDepositWallet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (!portfolioAddress) return;
    setLoading(true);
    fetch(`https://data-api.polymarket.com/positions?user=${portfolioAddress.toLowerCase()}`)
      .then((r) => r.json())
      .then((data: Position[]) => setPositions(Array.isArray(data) ? data : []))
      .catch(() => setPositions([]))
      .finally(() => setLoading(false));
  }, [portfolioAddress]);

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Navbar */}
      <nav
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--bg) 85%, transparent)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="max-w-[1200px] mx-auto flex items-center justify-between px-4 md:px-8 h-14 md:h-16">
          <div className="flex items-center gap-4 md:gap-6">
            <a href="/" className="flex items-center gap-2 no-underline">
              <img src="/light.svg" alt="OnlyBonds" className="theme-logo-light h-5 md:h-7" />
              <img src="/dark.svg" alt="OnlyBonds" className="theme-logo-dark h-5 md:h-7" />
            </a>
            <a
              href="/portfolio"
              className="text-[14px] font-semibold"
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Portfolio
            </a>
          </div>
          {authenticated && address && (
            <span
              className="text-[12px] font-mono hidden md:block"
              style={{ color: "var(--text-tertiary)" }}
            >
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>
          )}
        </div>
      </nav>

      <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-8 md:pt-12 pb-16">
        <h1
          className="text-[28px] md:text-[40px] font-bold tracking-[-0.02em] mb-2"
          style={{ color: "var(--accent)" }}
        >
          Portfolio
        </h1>
        <p className="text-[15px] mb-8" style={{ color: "var(--text-secondary)" }}>
          Your Polymarket positions and trade history.
        </p>

        {!ready || !walletsReady ? null : !authenticated ? (
          <div
            className="flex flex-col items-center justify-center h-64 gap-4 rounded-2xl"
            style={{ background: "#161b22", border: "1px solid #1f2937" }}
          >
            <p className="text-[16px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              Connect your wallet to view your portfolio
            </p>
            <button
              onClick={login}
              className="px-6 py-3 rounded-xl font-semibold text-[15px] cursor-pointer transition-all hover:opacity-90"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
              }}
            >
              Connect Wallet
            </button>
          </div>
        ) : !wallet ? (
          <div
            className="flex flex-col items-center justify-center h-64 gap-4 rounded-2xl"
            style={{ background: "#161b22", border: "1px solid #1f2937" }}
          >
            <p className="text-[16px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              Loading wallet…
            </p>
          </div>
        ) : (
          <>
            <FundsPanel
              address={address ?? ""}
              depositWallet={depositWallet}
              wallet={wallet}
              connectedPusdBalance={usdcBalance}
              tradingPusdBalance={tradingUsdcBalance}
              onDeployWallet={handleDeployDepositWallet}
              onBalanceRefresh={refreshBalances}
            />
            <SummaryBar positions={positions} />

            {/* Tabs */}
            <div className="flex gap-6 mb-6" style={{ borderBottom: "1px solid #1f2937" }}>
              {(
                [
                  { v: "positions", l: "Positions" },
                  { v: "history", l: "Trade History" },
                ] as { v: Tab; l: string }[]
              ).map((t) => (
                <button
                  key={t.v}
                  onClick={() => setTab(t.v)}
                  className="pb-3 text-[14px] font-semibold cursor-pointer transition-colors"
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0 0 12px",
                    color: tab === t.v ? "var(--text)" : "var(--text-tertiary)",
                    borderBottom: tab === t.v ? "2px solid var(--accent)" : "2px solid transparent",
                    marginBottom: "-1px",
                  }}
                >
                  {t.l}
                  {t.v === "positions" ? ` (${positions.length})` : ""}
                </button>
              ))}
            </div>

            {/* Content */}
            <div
              className="rounded-xl p-5"
              style={{ background: "#161b22", border: "1px solid #1f2937" }}
            >
              {tab === "positions" ? (
                loading ? (
                  <div className="flex items-center justify-center h-32">
                    <span className="text-[14px]" style={{ color: "#6b7280" }}>
                      Loading positions…
                    </span>
                  </div>
                ) : (
                  <PositionsTable positions={positions} />
                )
              ) : (
                portfolioAddress && <ActivityTable address={portfolioAddress.toLowerCase()} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
