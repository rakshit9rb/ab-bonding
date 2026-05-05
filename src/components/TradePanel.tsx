"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ConnectedWallet } from "@privy-io/react-auth";
import { usePrivy, useSendTransaction, useWallets } from "@privy-io/react-auth";
import posthog from "posthog-js";
import { Bond, fmtVolume } from "@/lib/bonds";
import {
  POLYGON_CHAIN_ID,
  ensureWalletOnPolygon,
  getPrimaryWallet,
  parseWalletChainId,
} from "@/lib/privyWallet";
import {
  CLOB_URL,
  COLLATERAL_ONRAMP_ADDRESS,
  CONDITIONAL_TOKENS_ADDRESS,
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  approveCtfSponsored,
  calcMarketPreview,
  calcSellPreview,
  signAndPlaceOrder,
  getUsdcBalance,
  getUsdcAllowance,
  getUsdceBalance,
  getUsdceAllowance,
  getCtfApproval,
  approveUsdcSponsored,
  approveUsdceOnrampSponsored,
  wrapUsdceSponsored,
  OrderBook,
  OrderPlacementResult,
  OrderPreview,
  OrderType,
} from "@/lib/polymarket";
import { getOrCreateCreds, clearCreds, ApiCredentials } from "@/lib/polymarketAuth";

interface Props {
  bond: Bond;
  onClose: () => void;
}
type Outcome = "YES" | "NO";
type TradeDir = "BUY" | "SELL";

type GeoStatus = "checking" | "allowed" | "blocked" | "error";

interface ClobAccountSnapshot {
  collateral: {
    balance: number;
    allowance: number;
    reserved: number;
    available: number;
  };
  conditional: {
    balance: number;
    allowance: number;
    reserved: number;
    available: number;
  } | null;
  openOrderCount: number;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatOrderSuccess(result: OrderPlacementResult, orderType: OrderType) {
  const hash = result.transactionHashes?.[0];
  const hashText = hash ? ` Tx ${shortHash(hash)}.` : "";
  switch (result.status) {
    case "matched":
      return `Order matched immediately.${hashText}`;
    case "delayed":
      return "Order accepted. Match is delayed by market conditions.";
    case "unmatched":
      return "Order accepted but not matched; it is resting on the book.";
    case "live":
      return orderType === "GTC"
        ? "Limit order live on the book."
        : "Order accepted but not filled yet.";
    default:
      return result.status ? `Order accepted (${result.status}).` : "Order accepted.";
  }
}

function formatOrderError(error: string | undefined) {
  if (!error) return "Order failed";
  if (error.includes("FOK_ORDER_NOT_FILLED_ERROR")) {
    return "FOK order was not filled. The book moved or there was not enough liquidity.";
  }
  if (error.includes("INVALID_ORDER_NOT_ENOUGH_BALANCE")) {
    return "Insufficient balance, allowance, or available funds after open orders.";
  }
  if (error.includes("INVALID_ORDER_MIN_TICK_SIZE")) {
    return "Price does not match this market's tick size.";
  }
  if (error.includes("INVALID_ORDER_MIN_SIZE")) {
    return "Order is below Polymarket's minimum size.";
  }
  if (error.includes("MARKET_NOT_READY")) {
    return "Market is not accepting orders yet.";
  }
  if (error.includes("ORDER_DELAYED")) {
    return "Order match was delayed by market conditions.";
  }
  if (error.includes("EXECUTION_ERROR")) {
    return "Polymarket accepted the order but execution failed upstream.";
  }
  return error;
}

function formatLifecycleStatus(status: string | null | undefined) {
  if (!status) return null;
  const normalized = status.replace(/^TRADE_STATUS_/, "").replace(/^ORDER_STATUS_/, "");
  switch (normalized) {
    case "MATCHED":
      return "Matched; waiting for onchain settlement.";
    case "MINED":
      return "Matched and mined; waiting for final confirmation.";
    case "CONFIRMED":
      return "Trade confirmed onchain.";
    case "RETRYING":
      return "Trade settlement is retrying upstream.";
    case "FAILED":
      return "Trade settlement failed upstream.";
    case "LIVE":
      return "Order is live on the book.";
    case "CANCELED":
    case "CANCELED_MARKET_RESOLVED":
      return "Order was canceled.";
    default:
      return `Latest status: ${normalized}.`;
  }
}

async function fetchClobAccountSnapshot(address: string, tokenId: string) {
  const params = new URLSearchParams({ address, tokenId });
  const res = await fetch(`/api/clob/account?${params.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not check CLOB account balance");
  return data as ClobAccountSnapshot;
}

async function fetchOrderLifecycle(address: string, orderId?: string, tradeId?: string) {
  const params = new URLSearchParams({ address });
  if (orderId) params.set("orderId", orderId);
  if (tradeId) params.set("tradeId", tradeId);
  const res = await fetch(`/api/clob/order-status?${params.toString()}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not check order status");
  return data as { status?: string | null };
}

// ── Order Book Display ───────────────────────────────────────────────────────

function OrderBookDisplay({ book }: { book: OrderBook }) {
  const rawAsks = book.asks ?? [];
  const rawBids = book.bids ?? [];

  const asks = [...rawAsks].slice(-8);
  const bids = [...rawBids].slice(-8).reverse();
  const maxSize = Math.max(...[...asks, ...bids].map((l) => parseFloat(l.size) || 0), 1);

  return (
    <div className="flex flex-col h-full">
      <div
        className="grid grid-cols-3 text-[10px] font-semibold uppercase tracking-wider pb-1 mb-1"
        style={{ color: "#4b5563", borderBottom: "1px solid #1f2937" }}
      >
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>

      <div className="flex flex-col gap-[2px] mb-1">
        {asks.map((ask, i) => {
          const pct = (parseFloat(ask.size) / maxSize) * 100;
          return (
            <div
              key={i}
              className="relative grid grid-cols-3 text-[11px] font-mono py-[2px] px-1 rounded-sm overflow-hidden"
            >
              <div
                className="absolute inset-0"
                style={{
                  background: "rgba(220,38,38,0.12)",
                  width: `${pct}%`,
                  left: "auto",
                  right: 0,
                }}
              />
              <span className="relative" style={{ color: "#f87171" }}>
                {(parseFloat(ask.price) * 100).toFixed(1)}¢
              </span>
              <span className="relative text-right" style={{ color: "#9ca3af" }}>
                {parseFloat(ask.size).toFixed(0)}
              </span>
              <span className="relative text-right" style={{ color: "#6b7280" }}>
                ${(parseFloat(ask.price) * parseFloat(ask.size)).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {book.asks?.length &&
        book.bids?.length &&
        (() => {
          const ba = parseFloat(book.asks[book.asks.length - 1].price);
          const bb = parseFloat(book.bids[book.bids.length - 1].price);
          return (
            <div
              className="text-center text-[10px] py-1 my-0.5"
              style={{
                color: "#4b5563",
                borderTop: "1px solid #1f2937",
                borderBottom: "1px solid #1f2937",
              }}
            >
              Spread {((ba - bb) * 100).toFixed(1)}¢
            </div>
          );
        })()}

      <div className="flex flex-col gap-[2px] mt-1">
        {bids.map((bid, i) => {
          const pct = (parseFloat(bid.size) / maxSize) * 100;
          return (
            <div
              key={i}
              className="relative grid grid-cols-3 text-[11px] font-mono py-[2px] px-1 rounded-sm overflow-hidden"
            >
              <div
                className="absolute inset-0"
                style={{ background: "rgba(5,150,80,0.12)", width: `${pct}%` }}
              />
              <span className="relative" style={{ color: "#4ade80" }}>
                {(parseFloat(bid.price) * 100).toFixed(1)}¢
              </span>
              <span className="relative text-right" style={{ color: "#9ca3af" }}>
                {parseFloat(bid.size).toFixed(0)}
              </span>
              <span className="relative text-right" style={{ color: "#6b7280" }}>
                ${(parseFloat(bid.price) * parseFloat(bid.size)).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Deposit Panel ────────────────────────────────────────────────────────────

function DepositPanel({
  address,
  wallet,
  usdcBalance,
  usdceBalance,
  usdceAllowance,
  onBalanceRefresh,
}: {
  address: string;
  wallet: ConnectedWallet;
  usdcBalance: number | null;
  usdceBalance: number | null;
  usdceAllowance: number | null;
  onBalanceRefresh: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [wrapAmount, setWrapAmount] = useState("");
  const [wrapStatus, setWrapStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [wrapMsg, setWrapMsg] = useState("");
  const { sendTransaction } = useSendTransaction();
  const wrapNum = parseFloat(wrapAmount || "0");
  const needsOnrampApproval = usdceAllowance !== null && wrapNum > 0 && wrapNum > usdceAllowance;
  const insufficientUsdce = usdceBalance !== null && wrapNum > 0 && wrapNum > usdceBalance;

  const copy = () => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleWrap = async () => {
    if (isNaN(wrapNum) || wrapNum <= 0 || insufficientUsdce) return;
    setWrapStatus("loading");
    setWrapMsg("");
    try {
      await ensureWalletOnPolygon(wallet);
      const rawAmount = BigInt(Math.round(wrapNum * 1_000_000));
      const result = needsOnrampApproval
        ? await approveUsdceOnrampSponsored(sendTransaction, address)
        : await wrapUsdceSponsored({
            sendTransaction,
            address,
            amount: rawAmount,
          });
      if (!result.success) throw new Error(result.error ?? "Transaction failed");
      setWrapStatus("success");
      setWrapMsg(
        needsOnrampApproval
          ? "USDC.e approved. Wrap it next."
          : `Wrapped $${wrapNum.toFixed(2)} into pUSD`,
      );
      if (!needsOnrampApproval) setWrapAmount("");
      setTimeout(onBalanceRefresh, 3000);
    } catch (e: any) {
      setWrapStatus("error");
      setWrapMsg(e?.message ?? "Transaction failed");
    }
  };

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{ background: "#161b22", border: "1px solid #2d3748" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color: "#6b7280" }}
        >
          Fund pUSD
        </span>
        {usdcBalance !== null && (
          <span
            className="text-[12px] font-mono font-semibold"
            style={{ color: usdcBalance > 0 ? "#4ade80" : "#6b7280" }}
          >
            ${usdcBalance.toFixed(2)} pUSD
          </span>
        )}
      </div>

      <p className="text-[12px] mb-3" style={{ color: "#9ca3af" }}>
        Already have <strong style={{ color: "#e5e7eb" }}>pUSD</strong>? Send it on{" "}
        <strong style={{ color: "#e5e7eb" }}>Polygon</strong> to this wallet.
      </p>

      <div className="flex gap-2 mb-3">
        <code
          className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-mono truncate"
          style={{
            background: "#0d1117",
            border: "1px solid #374151",
            color: "#9ca3af",
          }}
        >
          {address}
        </code>
        <button
          onClick={copy}
          className="px-3 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer transition-all shrink-0"
          style={{
            background: copied ? "rgba(5,150,80,0.2)" : "rgba(255,255,255,0.06)",
            border: "1px solid #374151",
            color: copied ? "#4ade80" : "#9ca3af",
          }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      <div
        className="rounded-lg p-3 mt-3"
        style={{ background: "#0d1117", border: "1px solid #374151" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase" style={{ color: "#6b7280" }}>
            Wrap USDC.e
          </span>
          {usdceBalance !== null && (
            <span className="text-[11px] font-mono" style={{ color: "#9ca3af" }}>
              ${usdceBalance.toFixed(2)} available
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={wrapAmount}
            onChange={(e) => setWrapAmount(e.target.value)}
            type="number"
            min="0"
            placeholder="Amount"
            className="min-w-0 flex-1 px-2 py-1.5 rounded-md text-[12px] font-mono outline-none"
            style={{
              background: "#161b22",
              border: `1px solid ${insufficientUsdce ? "rgba(220,38,38,0.4)" : "#374151"}`,
              color: "#e5e7eb",
            }}
          />
          <button
            onClick={handleWrap}
            disabled={wrapStatus === "loading" || !wrapNum || insufficientUsdce}
            className="px-3 py-1.5 rounded-md text-[12px] font-semibold cursor-pointer disabled:opacity-50 shrink-0"
            style={{
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.3)",
              color: "#60a5fa",
            }}
          >
            {wrapStatus === "loading" ? "Working..." : needsOnrampApproval ? "Approve" : "Wrap"}
          </button>
        </div>
        {wrapMsg && (
          <div
            className="text-[11px] mt-2"
            style={{ color: wrapStatus === "error" ? "#f87171" : "#4ade80" }}
          >
            {wrapMsg}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "success" | "error" | "approving" | "switching" | "authing";

export default function TradePanel({ bond, onClose }: Props) {
  const { authenticated, login, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { sendTransaction } = useSendTransaction();

  const [outcome, setOutcome] = useState<Outcome>(bond.outcome);
  const [tradeDir, setTradeDir] = useState<TradeDir>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("FOK");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [book, setBook] = useState<OrderBook | null>(null);
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [usdceBalance, setUsdceBalance] = useState<number | null>(null);
  const [usdceAllowance, setUsdceAllowance] = useState<number | null>(null);
  const [collateralAllowance, setCollateralAllowance] = useState<number | null>(null);
  const [ctfApproval, setCtfApproval] = useState<boolean | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [creds, setCreds] = useState<ApiCredentials | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("checking");
  const [geoMessage, setGeoMessage] = useState("");
  const [showDeposit, setShowDeposit] = useState(false);
  const previewSig = useRef("");

  const wallet = useMemo(
    () => (walletsReady ? getPrimaryWallet(wallets) : null),
    [wallets, walletsReady],
  );
  const yesTokenId = bond.clobTokenIds?.[0];
  const tokenId = outcome === "YES" ? yesTokenId : bond.clobTokenIds?.[1];
  const exchange = bond.negRisk ? NEG_RISK_CTF_EXCHANGE : CTF_EXCHANGE;

  // Derived best prices — from the currently-fetched token's book
  const asks = book?.asks ?? [];
  const bids = book?.bids ?? [];
  const bestAsk = asks.length ? parseFloat(asks[asks.length - 1].price) : null;
  const bestBid = bids.length ? parseFloat(bids[bids.length - 1].price) : null;
  const lastPrice = book?.last_trade_price ? parseFloat(book.last_trade_price) : null;
  const midPrice = lastPrice ?? (bestAsk && bestBid ? (bestAsk + bestBid) / 2 : bond.price);

  const onPolygon = chainId === POLYGON_CHAIN_ID;

  const metricProps = useCallback(
    (overrides: Record<string, unknown> = {}) => ({
      user_id: user?.id ?? null,
      wallet_address: wallet?.address ?? null,
      bond_id: bond.id,
      condition_id: bond.conditionId,
      market_slug: bond.slug,
      trade_dir: tradeDir,
      outcome,
      order_type: orderType,
      neg_risk: bond.negRisk,
      ...overrides,
    }),
    [
      user?.id,
      wallet?.address,
      bond.id,
      bond.conditionId,
      bond.slug,
      tradeDir,
      outcome,
      orderType,
      bond.negRisk,
    ],
  );

  const captureServer = useCallback(
    (event: string, properties: Record<string, unknown> = {}) => {
      const distinctId = user?.id;
      if (!distinctId) return;
      void fetch("/api/metrics/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, distinctId, properties }),
      });
    },
    [user?.id],
  );

  useEffect(() => {
    let cancelled = false;
    setGeoStatus("checking");
    fetch("/api/geoblock", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || data?.blocked === true) {
          setGeoStatus("blocked");
          setGeoMessage(data?.reason ?? "Polymarket trading is not available in this region.");
          return;
        }
        setGeoStatus("allowed");
        setGeoMessage("");
      })
      .catch(() => {
        if (cancelled) return;
        setGeoStatus("error");
        setGeoMessage("Could not verify Polymarket availability for this region.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!wallet?.address) {
      setUsdcBalance(null);
      setUsdceBalance(null);
      setUsdceAllowance(null);
      setCollateralAllowance(null);
      setCtfApproval(null);
      return;
    }
    const [balance, usdce, nextUsdceAllowance, nextCollateralAllowance, nextCtfApproval] =
      await Promise.all([
        getUsdcBalance(wallet.address),
        getUsdceBalance(wallet.address),
        getUsdceAllowance(wallet.address, COLLATERAL_ONRAMP_ADDRESS),
        getUsdcAllowance(wallet.address, CONDITIONAL_TOKENS_ADDRESS),
        getCtfApproval(wallet.address, exchange),
      ]);
    setUsdcBalance(balance);
    setUsdceBalance(usdce);
    setUsdceAllowance(nextUsdceAllowance);
    setCollateralAllowance(nextCollateralAllowance);
    setCtfApproval(nextCtfApproval);
  }, [wallet?.address, exchange]);

  useEffect(() => {
    posthog?.capture(
      "trade_panel_opened",
      metricProps({
        market_volume: bond.volume,
        market_liquidity: bond.liquidity,
      }),
    );
  }, [posthog, metricProps, bond.volume, bond.liquidity]);

  useEffect(() => {
    if (!authenticated || !user?.id) return;
    posthog?.identify(user.id, { wallet_address: wallet?.address ?? null });
  }, [authenticated, user?.id, wallet?.address, posthog]);

  // Order book polling every 2s — re-fetch when outcome changes (YES vs NO token)
  useEffect(() => {
    console.log(
      "[TradePanel] tokenId changed:",
      outcome,
      tokenId,
      "clobTokenIds:",
      bond.clobTokenIds,
    );
    if (!tokenId) return;
    setBook(null);
    const load = async () => {
      try {
        const [bookRes, feeRes] = await Promise.all([
          fetch(`${CLOB_URL}/book?token_id=${tokenId}`),
          fetch(`${CLOB_URL}/fee-rate?token_id=${tokenId}`),
        ]);
        if (!bookRes.ok) return;
        const nextBook = await bookRes.json();
        const fee = feeRes.ok ? await feeRes.json() : null;
        const baseFee =
          typeof fee?.base_fee === "number"
            ? fee.base_fee
            : Number.parseFloat(String(fee?.base_fee ?? "0"));
        setBook({
          ...nextBook,
          base_fee: Number.isFinite(baseFee) ? baseFee : 0,
        });
      } catch {}
    };
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [tokenId]);

  // Chain + balance + allowance when wallet connects
  useEffect(() => {
    if (!wallet?.address) {
      setChainId(null);
      setUsdcBalance(null);
      setUsdceBalance(null);
      setUsdceAllowance(null);
      setCollateralAllowance(null);
      setCtfApproval(null);
      return;
    }
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const provider = await wallet.getEthereumProvider();
        const cid = await provider.request({ method: "eth_chainId" });
        setChainId(parseWalletChainId(String(cid)));
        const onChainChanged = (id: unknown) => setChainId(parseWalletChainId(String(id)));
        provider.on?.("chainChanged", onChainChanged);
        cleanup = () => {
          provider.removeListener?.("chainChanged", onChainChanged);
        };
      } catch {}

      refreshBalances();
    })();
    return () => cleanup?.();
  }, [wallet?.address, refreshBalances]);

  // Preview calculation
  useEffect(() => {
    if (!book || !amount) {
      setPreview(null);
      return;
    }
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setPreview(null);
      return;
    }

    if (orderType === "GTC") {
      const price = parseFloat(limitPrice);
      if (isNaN(price) || price <= 0 || price >= 1) {
        setPreview(null);
        return;
      }
      const shares = tradeDir === "BUY" ? num / price : num;
      setPreview({
        avgPrice: price,
        shares,
        totalCost: tradeDir === "BUY" ? num : shares * price,
        potentialReturn: tradeDir === "BUY" ? shares - num : shares * price,
        priceImpact: 0,
      });
    } else if (tradeDir === "BUY") {
      setPreview(calcMarketPreview(book, num));
    } else {
      setPreview(calcSellPreview(book, num));
    }
  }, [book, amount, outcome, tradeDir, orderType, limitPrice]);

  useEffect(() => {
    if (!preview) return;
    const sig = [
      tradeDir,
      outcome,
      orderType,
      preview.shares.toFixed(4),
      preview.avgPrice.toFixed(4),
      preview.totalCost.toFixed(4),
    ].join(":");
    if (sig === previewSig.current) return;
    previewSig.current = sig;
    posthog?.capture(
      "trade_preview_computed",
      metricProps({
        shares: preview.shares,
        avg_price: preview.avgPrice,
        notional_usdc: preview.totalCost,
        price_impact: preview.priceImpact,
      }),
    );
  }, [preview, tradeDir, outcome, orderType, posthog, metricProps]);

  // Switch to Polygon
  const switchToPolygon = useCallback(async () => {
    if (!wallet) return;
    posthog?.capture("network_switch_attempted", metricProps());
    captureServer("network_switch_attempted", metricProps());
    setStatus("switching");
    try {
      await ensureWalletOnPolygon(wallet);
      setChainId(POLYGON_CHAIN_ID);
      await refreshBalances();
    } catch (e: any) {
      posthog?.capture(
        "network_switch_failed",
        metricProps({
          error_message: e?.message ?? "Could not switch network",
        }),
      );
      captureServer(
        "network_switch_failed",
        metricProps({
          error_message: e?.message ?? "Could not switch network",
        }),
      );
      setStatus("error");
      setStatusMsg(e?.message ?? "Could not switch network");
      return;
    }
    setStatus("idle");
  }, [wallet, refreshBalances, posthog, metricProps, captureServer]);

  // Get CLOB API credentials (L1 auth → API key)
  const ensureCreds = useCallback(
    async (walletClient: any): Promise<ApiCredentials | null> => {
      if (creds) return creds;
      setStatus("authing");
      setStatusMsg("Sign once to enable trading…");
      const c = await getOrCreateCreds(walletClient, wallet!.address);
      if (c) {
        setCreds(c);
        setStatus("idle");
        setStatusMsg("");
      } else {
        setStatus("error");
        setStatusMsg("Auth failed — please try again");
      }
      return c;
    },
    [creds, wallet],
  );

  // Approve collateral
  const handleApprove = useCallback(async () => {
    if (!wallet) return;
    posthog?.capture("usdc_approval_started", metricProps());
    captureServer("usdc_approval_started", metricProps());
    setStatus("approving");
    setStatusMsg(tradeDir === "BUY" ? "Approving pUSD…" : "Approving outcome tokens…");
    try {
      await ensureWalletOnPolygon(wallet);
      setChainId(POLYGON_CHAIN_ID);
      const result =
        tradeDir === "BUY"
          ? await approveUsdcSponsored(sendTransaction, wallet.address, CONDITIONAL_TOKENS_ADDRESS)
          : await approveCtfSponsored(sendTransaction, wallet.address, exchange);
      if (result.success) {
        posthog?.capture("usdc_approval_succeeded", metricProps());
        captureServer("usdc_approval_succeeded", metricProps());
        setStatusMsg("Approved! Refreshing…");
        // Wait a couple seconds for the tx to propagate then recheck
        setTimeout(() => {
          refreshBalances().then(() => {
            setStatus("idle");
            setStatusMsg("");
          });
        }, 3000);
      } else {
        posthog?.capture(
          "usdc_approval_failed",
          metricProps({
            error_message: result.error ?? "Approval failed",
          }),
        );
        captureServer(
          "usdc_approval_failed",
          metricProps({
            error_message: result.error ?? "Approval failed",
          }),
        );
        setStatus("error");
        setStatusMsg(result.error ?? "Approval failed");
      }
    } catch (e: any) {
      posthog?.capture(
        "usdc_approval_failed",
        metricProps({
          error_message: e?.message ?? "Approval failed",
        }),
      );
      captureServer(
        "usdc_approval_failed",
        metricProps({
          error_message: e?.message ?? "Approval failed",
        }),
      );
      setStatus("error");
      setStatusMsg(e?.message ?? "Approval failed");
    }
  }, [
    wallet,
    tradeDir,
    exchange,
    sendTransaction,
    refreshBalances,
    posthog,
    metricProps,
    captureServer,
  ]);

  // Place order
  const handleTrade = useCallback(async () => {
    if (!authenticated) {
      login();
      return;
    }
    if (!wallet || !tokenId || !preview) return;
    if (geoStatus !== "allowed") {
      setStatus("error");
      setStatusMsg(geoMessage || "Could not verify Polymarket availability for this region.");
      return;
    }
    const tradeProps = metricProps({
      token_id: tokenId,
      shares: preview.shares,
      avg_price: orderType === "FOK" ? preview.avgPrice : parseFloat(limitPrice),
      notional_usdc: tradeDir === "BUY" ? parseFloat(amount || "0") : preview.totalCost,
      price_impact: preview.priceImpact,
    });
    posthog?.capture("trade_submit_clicked", tradeProps);
    captureServer("trade_submit_clicked", tradeProps);
    setStatus("loading");
    setStatusMsg("");
    try {
      const { walletClient: wc } = await ensureWalletOnPolygon(wallet);
      setChainId(POLYGON_CHAIN_ID);

      // Ensure L2 creds
      const activeCreds = await ensureCreds(wc);
      if (!activeCreds) return;

      const accountSnapshot = await fetchClobAccountSnapshot(wallet.address, tokenId);
      const requiredAmount = tradeDir === "BUY" ? parseFloat(amount || "0") : preview.shares;
      const availableAmount =
        tradeDir === "BUY"
          ? accountSnapshot.collateral.available
          : (accountSnapshot.conditional?.available ?? 0);
      if (requiredAmount > availableAmount + 0.000001) {
        const message =
          tradeDir === "BUY"
            ? `Insufficient available pUSD after open orders. Available: $${availableAmount.toFixed(2)}.`
            : `Insufficient available ${outcome} shares after open orders. Available: ${availableAmount.toFixed(2)}.`;
        posthog?.capture("trade_failed", {
          ...tradeProps,
          error_message: message,
          clob_open_order_count: accountSnapshot.openOrderCount,
        });
        captureServer("trade_failed", {
          ...tradeProps,
          error_message: message,
          clob_open_order_count: accountSnapshot.openOrderCount,
        });
        setStatus("error");
        setStatusMsg(message);
        return;
      }

      const price =
        orderType === "FOK" ? (preview.limitPrice ?? preview.avgPrice) : parseFloat(limitPrice);
      const result = await signAndPlaceOrder({
        walletClient: wc,
        address: wallet.address,
        tokenId,
        side: tradeDir,
        orderType,
        price,
        size: preview.shares,
        amount: parseFloat(amount || "0"),
        negRisk: bond.negRisk,
        tickSize: book?.tick_size,
        userUSDCBalance: tradeDir === "BUY" ? accountSnapshot.collateral.available : usdcBalance,
      });

      if (result.success) {
        posthog?.capture("trade_succeeded", {
          ...tradeProps,
          order_id: result.orderId ?? null,
          order_status: result.status ?? null,
          transaction_hash: result.transactionHashes?.[0] ?? null,
          trade_id: result.tradeIds?.[0] ?? null,
        });
        captureServer("trade_succeeded", {
          ...tradeProps,
          order_id: result.orderId ?? null,
          order_status: result.status ?? null,
          transaction_hash: result.transactionHashes?.[0] ?? null,
          trade_id: result.tradeIds?.[0] ?? null,
        });
        setStatus("success");
        setStatusMsg(formatOrderSuccess(result, orderType));
        setAmount("");
        refreshBalances();
        if (result.orderId || result.tradeIds?.[0]) {
          const orderId = result.orderId;
          const tradeId = result.tradeIds?.[0];
          setTimeout(() => {
            fetchOrderLifecycle(wallet.address, orderId, tradeId)
              .then((lifecycle) => {
                const lifecycleMsg = formatLifecycleStatus(lifecycle.status);
                if (lifecycleMsg) setStatusMsg(lifecycleMsg);
              })
              .catch(() => {});
          }, 3000);
        }
      } else {
        // If auth error, clear stored creds so next attempt re-authenticates
        if (
          result.error?.includes("401") ||
          result.error?.includes("auth") ||
          result.error?.includes("key")
        ) {
          clearCreds(wallet.address);
          setCreds(null);
        }
        posthog?.capture("trade_failed", {
          ...tradeProps,
          error_message: result.error ?? "Order failed",
        });
        captureServer("trade_failed", {
          ...tradeProps,
          error_message: result.error ?? "Order failed",
        });
        setStatus("error");
        setStatusMsg(formatOrderError(result.error));
      }
    } catch (e: any) {
      posthog?.capture("trade_failed", {
        ...tradeProps,
        error_message: e?.message ?? "Unknown error",
      });
      captureServer("trade_failed", {
        ...tradeProps,
        error_message: e?.message ?? "Unknown error",
      });
      setStatus("error");
      setStatusMsg(e?.message ?? "Unknown error");
    }
  }, [
    authenticated,
    login,
    wallet,
    tokenId,
    preview,
    orderType,
    limitPrice,
    tradeDir,
    bond.negRisk,
    exchange,
    ensureCreds,
    creds,
    refreshBalances,
    posthog,
    metricProps,
    captureServer,
    amount,
    geoMessage,
    geoStatus,
    usdcBalance,
  ]);

  const usdcNum = parseFloat(amount || "0");
  const geoUnavailable = geoStatus !== "allowed";
  const needsApproval =
    tradeDir === "BUY"
      ? collateralAllowance !== null && usdcNum > collateralAllowance
      : ctfApproval !== true;
  const insufficientFunds = tradeDir === "BUY" && usdcBalance !== null && usdcNum > usdcBalance;
  const approvalLabel = tradeDir === "BUY" ? "Approve pUSD" : "Approve outcome tokens";
  const isLoading =
    status === "loading" ||
    status === "approving" ||
    status === "switching" ||
    status === "authing";

  return (
    <div
      className="col-span-full overflow-hidden"
      style={{ borderBottom: "1px solid var(--border)", background: "#0d1117" }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-0">
        {/* ── Order Book ── */}
        <div className="p-4 border-r" style={{ borderColor: "#1f2937" }}>
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "#4b5563" }}
            >
              Order Book
            </span>
            <div className="flex items-center gap-3 text-[12px] font-mono">
              <span style={{ color: "#4ade80" }}>
                B {bestBid ? (bestBid * 100).toFixed(1) : "—"}¢
              </span>
              <span style={{ color: "#f87171" }}>
                A {bestAsk ? (bestAsk * 100).toFixed(1) : "—"}¢
              </span>
              <span style={{ color: "#6b7280" }}>
                {lastPrice
                  ? `Last ${(lastPrice * 100).toFixed(1)}¢`
                  : `Mid ${(midPrice * 100).toFixed(1)}¢`}
              </span>
            </div>
          </div>
          {book ? (
            <OrderBookDisplay book={book} />
          ) : (
            <div
              className="flex items-center justify-center h-32 text-[13px]"
              style={{ color: "#4b5563" }}
            >
              Loading order book…
            </div>
          )}
          <div
            className="flex items-center gap-4 mt-3 pt-3 text-[12px]"
            style={{ borderTop: "1px solid #1f2937", color: "#4b5563" }}
          >
            <span>Vol {fmtVolume(bond.volume)}</span>
            <span>Liq {fmtVolume(bond.liquidity)}</span>
          </div>
        </div>

        {/* ── Trade Form ── */}
        <div className="p-4 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "#4b5563" }}
            >
              Place Order
            </span>
            <div className="flex items-center gap-3">
              {wallet?.address && (
                <button
                  onClick={() => setShowDeposit((v) => !v)}
                  className="text-[11px] cursor-pointer transition-opacity hover:opacity-70 bg-transparent border-none p-0"
                  style={{ color: showDeposit ? "#60a5fa" : "#4b5563" }}
                >
                  {showDeposit ? "Hide deposit" : "Deposit ↓"}
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4b5563",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Deposit Panel */}
          {showDeposit && wallet?.address && (
            <DepositPanel
              address={wallet.address}
              wallet={wallet}
              usdcBalance={usdcBalance}
              usdceBalance={usdceBalance}
              usdceAllowance={usdceAllowance}
              onBalanceRefresh={refreshBalances}
            />
          )}

          {/* Balance + Network indicator */}
          {wallet?.address && (
            <div className="flex items-center justify-between text-[12px]">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: onPolygon ? "#4ade80" : "#f87171" }}
                />
                <span style={{ color: "#6b7280" }}>{onPolygon ? "Polygon" : "Wrong network"}</span>
              </div>
              {usdcBalance !== null && (
                <span style={{ color: "#6b7280" }}>
                  Balance:{" "}
                  <span className="font-mono" style={{ color: "#9ca3af" }}>
                    ${usdcBalance.toFixed(2)}
                  </span>
                </span>
              )}
            </div>
          )}

          {geoStatus !== "allowed" && (
            <div
              className="text-[12px] px-2.5 py-1.5 rounded-lg"
              style={{
                background:
                  geoStatus === "checking" ? "rgba(59,130,246,0.1)" : "rgba(220,38,38,0.1)",
                color: geoStatus === "checking" ? "#60a5fa" : "#f87171",
              }}
            >
              {geoStatus === "checking"
                ? "Checking Polymarket availability…"
                : geoMessage || "Polymarket trading is not available in this region."}
            </div>
          )}

          {/* Wrong network banner */}
          {authenticated && wallet && !onPolygon && chainId !== null && (
            <button
              onClick={switchToPolygon}
              disabled={isLoading}
              className="w-full py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-all disabled:opacity-50"
              style={{
                background: "rgba(234,179,8,0.12)",
                border: "1px solid rgba(234,179,8,0.3)",
                color: "#fbbf24",
              }}
            >
              {status === "switching" ? "Switching…" : "Switch to Polygon to trade"}
            </button>
          )}

          {/* BUY / SELL */}
          <div className="grid grid-cols-2 gap-1.5">
            {(["BUY", "SELL"] as TradeDir[]).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setTradeDir(d);
                  setAmount("");
                }}
                className="py-1.5 rounded-md text-[12px] font-semibold cursor-pointer transition-all"
                style={{
                  background:
                    tradeDir === d
                      ? d === "BUY"
                        ? "rgba(5,150,80,0.2)"
                        : "rgba(220,38,38,0.15)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${tradeDir === d ? (d === "BUY" ? "rgba(5,150,80,0.5)" : "rgba(220,38,38,0.4)") : "#1f2937"}`,
                  color: tradeDir === d ? (d === "BUY" ? "#4ade80" : "#f87171") : "#4b5563",
                }}
              >
                {d}
              </button>
            ))}
          </div>

          {/* YES / NO */}
          <div className="grid grid-cols-2 gap-1.5">
            {(["YES", "NO"] as Outcome[]).map((o) => (
              <button
                key={o}
                onClick={() => setOutcome(o)}
                className="py-2 rounded-lg font-semibold text-[13px] cursor-pointer transition-all"
                style={{
                  background:
                    outcome === o
                      ? o === "YES"
                        ? "rgba(5,150,80,0.25)"
                        : "rgba(220,38,38,0.2)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${outcome === o ? (o === "YES" ? "rgba(5,150,80,0.6)" : "rgba(220,38,38,0.5)") : "#1f2937"}`,
                  color: outcome === o ? (o === "YES" ? "#4ade80" : "#f87171") : "#4b5563",
                }}
              >
                {o} {bestAsk && outcome === o ? `${(bestAsk * 100).toFixed(0)}¢` : ""}
              </button>
            ))}
          </div>

          {/* Market / Limit */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { v: "FOK" as OrderType, l: "Market" },
              { v: "GTC" as OrderType, l: "Limit" },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setOrderType(o.v)}
                className="py-1.5 rounded-md text-[12px] cursor-pointer transition-all"
                style={{
                  background: orderType === o.v ? "rgba(255,255,255,0.08)" : "transparent",
                  border: `1px solid ${orderType === o.v ? "#374151" : "#1f2937"}`,
                  color: orderType === o.v ? "#9ca3af" : "#4b5563",
                }}
              >
                {o.l}
              </button>
            ))}
          </div>

          {/* Limit price */}
          {orderType === "GTC" && (
            <input
              type="number"
              min="0.01"
              max="0.99"
              step="0.01"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={`Price (e.g. ${midPrice.toFixed(2)})`}
              className="w-full px-3 py-2 rounded-lg text-[13px] font-mono outline-none"
              style={{
                background: "#161b22",
                border: "1px solid #1f2937",
                color: "#e5e7eb",
              }}
            />
          )}

          {/* Amount */}
          <div>
            <div className="relative">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-mono"
                style={{ color: "#4b5563" }}
              >
                {tradeDir === "BUY" ? "$" : "#"}
              </span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={tradeDir === "BUY" ? "pUSD to spend" : "Shares to sell"}
                className="w-full pl-6 pr-3 py-2 rounded-lg text-[13px] font-mono outline-none"
                style={{
                  background: "#161b22",
                  border: `1px solid ${insufficientFunds ? "rgba(220,38,38,0.4)" : "#1f2937"}`,
                  color: "#e5e7eb",
                }}
              />
            </div>
            {tradeDir === "BUY" && (
              <div className="flex gap-1 mt-1.5">
                {[10, 25, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    className="flex-1 py-1 rounded text-[11px] cursor-pointer transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid #1f2937",
                      color: "#4b5563",
                    }}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          {preview && (
            <div
              className="rounded-lg p-2.5 text-[12px] font-mono"
              style={{ background: "#161b22", border: "1px solid #1f2937" }}
            >
              <div className="flex justify-between mb-1">
                <span style={{ color: "#6b7280" }}>Avg price</span>
                <span style={{ color: "#e5e7eb" }}>{(preview.avgPrice * 100).toFixed(2)}¢</span>
              </div>
              <div className="flex justify-between mb-1">
                <span style={{ color: "#6b7280" }}>
                  {tradeDir === "BUY" ? "Shares" : "Shares sold"}
                </span>
                <span style={{ color: "#e5e7eb" }}>{preview.shares.toFixed(2)}</span>
              </div>
              {preview.fee != null && preview.fee > 0 && (
                <div className="flex justify-between mb-1">
                  <span style={{ color: "#6b7280" }}>Est. taker fee</span>
                  <span style={{ color: "#e5e7eb" }}>${preview.fee.toFixed(4)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: "#6b7280" }}>
                  {tradeDir === "BUY" ? "Max profit" : "pUSD received"}
                </span>
                <span style={{ color: tradeDir === "BUY" ? "#4ade80" : "#60a5fa" }}>
                  {tradeDir === "BUY"
                    ? `+$${preview.potentialReturn.toFixed(2)}`
                    : `$${preview.totalCost.toFixed(2)}`}
                </span>
              </div>
              {preview.priceImpact > 0.5 && (
                <div className="flex justify-between mt-1">
                  <span style={{ color: "#6b7280" }}>Impact</span>
                  <span
                    style={{
                      color: preview.priceImpact > 2 ? "#f87171" : "#fbbf24",
                    }}
                  >
                    {preview.priceImpact.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Status message */}
          {statusMsg && (
            <div
              className="text-[12px] px-2.5 py-1.5 rounded-lg"
              style={{
                background:
                  status === "success"
                    ? "rgba(5,150,80,0.1)"
                    : status === "authing"
                      ? "rgba(59,130,246,0.1)"
                      : "rgba(220,38,38,0.1)",
                color:
                  status === "success" ? "#4ade80" : status === "authing" ? "#60a5fa" : "#f87171",
              }}
            >
              {statusMsg}
            </div>
          )}

          {/* CTA */}
          {geoUnavailable ? (
            <button
              disabled
              className="w-full py-2.5 rounded-lg font-semibold text-[13px] disabled:opacity-50"
              style={{
                background: "rgba(220,38,38,0.1)",
                color: "#f87171",
                border: "1px solid rgba(220,38,38,0.25)",
              }}
            >
              {geoStatus === "checking" ? "Checking availability…" : "Trading unavailable"}
            </button>
          ) : !authenticated ? (
            <button
              onClick={login}
              className="w-full py-2.5 rounded-lg font-semibold text-[14px] cursor-pointer transition-all"
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
              }}
            >
              Sign in to Trade
            </button>
          ) : !onPolygon && chainId !== null ? null /* handled above */ : needsApproval ? (
            <button
              onClick={handleApprove}
              disabled={isLoading}
              className="w-full py-2.5 rounded-lg font-semibold text-[13px] cursor-pointer disabled:opacity-50"
              style={{
                background: "rgba(234,179,8,0.12)",
                color: "#fbbf24",
                border: "1px solid rgba(234,179,8,0.25)",
              }}
            >
              {status === "approving" ? "Approving…" : approvalLabel}
            </button>
          ) : insufficientFunds ? (
            <button
              onClick={() => setShowDeposit(true)}
              className="w-full py-2.5 rounded-lg font-semibold text-[13px] cursor-pointer"
              style={{
                background: "rgba(220,38,38,0.1)",
                color: "#f87171",
                border: "1px solid rgba(220,38,38,0.25)",
              }}
            >
              Insufficient balance — Deposit pUSD
            </button>
          ) : (
            <button
              onClick={handleTrade}
              disabled={isLoading || !preview}
              className="w-full py-2.5 rounded-lg font-semibold text-[14px] cursor-pointer transition-all disabled:opacity-40"
              style={{
                background:
                  tradeDir === "BUY"
                    ? outcome === "YES"
                      ? "#059650"
                      : "#dc2626"
                    : "rgba(59,130,246,0.8)",
                color: "#fff",
                border: "none",
              }}
            >
              {isLoading
                ? status === "authing"
                  ? "Authenticating…"
                  : status === "switching"
                    ? "Switching…"
                    : "Placing…"
                : `${tradeDir} ${outcome}${preview ? ` · ${preview.shares.toFixed(1)} shares` : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
