"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  Bond,
  TimeFilter,
  SortKey,
  TimeLeft,
  applyFilters,
  splitPinned,
  getCategories,
  fmtAPY,
} from "@/lib/bonds";
import { PINNED_MARKETS } from "@/lib/constants";
import { getResolvedTheme, setThemePreference } from "@/lib/theme";
import BondRow from "./BondRow";

const TIME_OPTS: { value: TimeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hours", label: "24h" },
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function FilterLink({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-[14px] md:text-[15px] cursor-pointer transition-colors whitespace-nowrap"
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: active ? "var(--text)" : "var(--text-tertiary)",
        fontWeight: active ? 600 : 400,
        textDecoration: active ? "underline" : "none",
        textUnderlineOffset: "4px",
        textDecorationThickness: "2px",
      }}
    >
      {label}
    </button>
  );
}

function ThemeToggle() {
  const toggle = () => {
    const nextTheme = getResolvedTheme() === "dark" ? "light" : "dark";
    setThemePreference(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-[14px] cursor-pointer transition-colors"
      style={{
        background: "none",
        border: "none",
        padding: 0,
        color: "var(--text-tertiary)",
      }}
      aria-label="Toggle theme"
    >
      <svg
        className="theme-toggle-sun"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
      <svg
        className="theme-toggle-moon"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}

interface DashboardProps {
  initialBonds?: Bond[];
}

function PortfolioNavLink() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [balance, setBalance] = useState<number | null>(null);
  const address = wallets[0]?.address;

  useEffect(() => {
    if (!authenticated || !address) return;
    fetch(`/api/balance?address=${address}`)
      .then((r) => r.json())
      .then((d) => setBalance(typeof d.balance === "number" ? d.balance : null))
      .catch(() => {});
  }, [authenticated, address]);

  return (
    <a
      href="/portfolio"
      className="flex flex-col items-end no-underline leading-tight"
      style={{ textDecoration: "none" }}
    >
      <span
        className="text-[14px] font-semibold"
        style={{ color: "var(--accent)" }}
      >
        Portfolio
      </span>
      {authenticated && balance !== null && (
        <span
          className="text-[13px] font-bold font-mono"
          style={{ color: "#4ade80" }}
        >
          ${balance.toFixed(2)}
        </span>
      )}
    </a>
  );
}

function AuthButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const wallet = wallets[0];
  const address = wallet?.address;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Fetch balance when dropdown opens
  useEffect(() => {
    if (!open || !address) return;
    fetch(`/api/balance?address=${address}`)
      .then((r) => r.json())
      .then((d) => setBalance(typeof d.balance === "number" ? d.balance : null))
      .catch(() => {});
  }, [open, address]);

  const copy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!ready) return null;

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="text-[13px] md:text-[14px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer transition-all hover:opacity-90"
        style={{ background: "var(--accent)", color: "#fff", border: "none" }}
      >
        Sign in
      </button>
    );
  }

  const label =
    user?.google?.email?.split("@")[0] ??
    (address ? address.slice(0, 6) + "…" + address.slice(-4) : "Account");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium cursor-pointer transition-all"
        style={{
          background: open ? "var(--surface-secondary)" : "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
        }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: "#4ade80", flexShrink: 0 }}
        />
        {label}
        <span style={{ color: "var(--text-tertiary)", fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-2xl shadow-2xl z-50"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Balance hero */}
          <div
            className="px-5 pt-5 pb-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              USDC Balance
            </div>
            <div
              className="text-[32px] font-bold font-mono leading-none mb-0.5"
              style={{ color: "var(--text)" }}
            >
              {balance !== null ? `$${balance.toFixed(2)}` : "—"}
            </div>
            <div
              className="text-[12px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              on Polygon
            </div>
          </div>

          {/* Deposit address */}
          <div
            className="px-5 py-4"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div
              className="text-[11px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-tertiary)" }}
            >
              Deposit address · Polygon
            </div>
            {address ? (
              <>
                <div
                  className="font-mono text-[12px] break-all mb-3 leading-relaxed"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {address}
                </div>
                <button
                  onClick={copy}
                  className="w-full py-2 rounded-xl text-[13px] font-semibold cursor-pointer transition-all"
                  style={{
                    background: copied
                      ? "rgba(5,150,80,0.12)"
                      : "var(--surface-secondary)",
                    border: `1px solid ${copied ? "rgba(5,150,80,0.3)" : "var(--border)"}`,
                    color: copied ? "#4ade80" : "var(--text-secondary)",
                  }}
                >
                  {copied ? "✓ Copied" : "Copy address"}
                </button>
                <p
                  className="text-[11px] mt-2 text-center leading-relaxed"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Send{" "}
                  <strong style={{ color: "var(--text-secondary)" }}>
                    USDC.e
                  </strong>{" "}
                  on{" "}
                  <strong style={{ color: "var(--text-secondary)" }}>
                    Polygon
                  </strong>{" "}
                  only
                </p>
              </>
            ) : (
              <p
                className="text-[13px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                Loading wallet…
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3">
            <a
              href="/portfolio"
              className="text-[13px] font-semibold no-underline"
              style={{ color: "var(--accent)" }}
            >
              Portfolio →
            </a>
            <button
              onClick={logout}
              className="text-[13px] cursor-pointer appearance-none"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-tertiary)",
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ initialBonds }: DashboardProps) {
  const [allBonds, setAllBonds] = useState<Bond[]>(initialBonds ?? []);
  const [fetchedAt, setFetchedAt] = useState(() =>
    initialBonds?.length
      ? new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
  );
  const [loading, setLoading] = useState(!initialBonds?.length);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [catFilter, setCatFilter] = useState("all");
  const [catModes, setCatModes] = useState<Map<string, "include" | "exclude">>(
    new Map(),
  );
  const [sort, setSort] = useState<SortKey>("gain");
  const [sortAsc, setSortAsc] = useState(false);
  const [minLiquidity, setMinLiquidity] = useState(0);
  const [timeLeft, setTimeLeft] = useState<TimeLeft>("any");
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [minProb, setMinProb] = useState(0.95);
  const [disputes, setDisputes] = useState<Bond[]>([]);
  const [showDisputes, setShowDisputes] = useState(false);

  const loadDisputes = useCallback(async () => {
    try {
      const res = await fetch("/api/disputes");
      if (!res.ok) return;
      const data = await res.json();
      setDisputes(data.disputes ?? []);
    } catch {}
  }, []);

  const minProbRef = useRef(minProb);
  minProbRef.current = minProb;

  const load = useCallback(async (prob?: number) => {
    const p = prob ?? minProbRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/markets?minProb=${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAllBonds(data.bonds ?? []);
      setFetchedAt(
        new Date(data.fetchedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch {
      setError("Could not fetch markets.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    loadDisputes();
    const id = setInterval(loadDisputes, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [loadDisputes]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setShowFilter(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const categories = useMemo(() => getCategories(allBonds), [allBonds]);
  const displayed = useMemo(
    () =>
      applyFilters(
        allBonds,
        timeFilter,
        catFilter,
        catModes,
        sort,
        minLiquidity,
        timeLeft,
        sortAsc,
      ),
    [
      allBonds,
      timeFilter,
      catFilter,
      catModes,
      sort,
      minLiquidity,
      timeLeft,
      sortAsc,
    ],
  );
  const { pinned: pinnedRows, regular: regularRows } = useMemo(
    () => splitPinned(displayed, PINNED_MARKETS),
    [displayed],
  );

  const { avgAPY, bestAPY, todayCount } = useMemo(() => {
    let sum = 0,
      count = 0,
      best = 0,
      today = 0;
    const todayStr = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
    for (const b of allBonds) {
      if (b.apy != null && b.apy < 9999) {
        sum += b.apy;
        count++;
        if (b.apy > best) best = b.apy;
      }
      if (b.endDate?.slice(0, 10) === todayStr) today++;
    }
    return {
      avgAPY: count ? sum / count : null,
      bestAPY: count ? best : null,
      todayCount: today,
    };
  }, [allBonds]);

  const stats = showDisputes
    ? [
        { label: "Disputed", value: disputes.length, color: "var(--text)" },
        {
          label: "Avg APY",
          value: fmtAPY(
            disputes
              .map((b) => b.apy)
              .filter((a): a is number => a !== null && a < 9999)
              .reduce((a, b, _, arr) => a + b / arr.length, 0) || null,
          ),
          color: "var(--green)",
        },
        {
          label: "Best APY",
          value: fmtAPY(
            disputes
              .map((b) => b.apy)
              .filter((a): a is number => a !== null && a < 9999)
              .reduce((a, b) => Math.max(a, b), 0) || null,
          ),
          color: "var(--green)",
        },
        {
          label: "Expiring Today",
          value: disputes.filter(
            (b) =>
              new Date(b.endDate).toDateString() === new Date().toDateString(),
          ).length,
          color: "var(--text)",
        },
      ]
    : [
        { label: "Markets", value: allBonds.length, color: "var(--text)" },
        { label: "Avg APY", value: fmtAPY(avgAPY), color: "var(--green)" },
        { label: "Best APY", value: fmtAPY(bestAPY), color: "var(--green)" },
        { label: "Expiring Today", value: todayCount, color: "var(--text)" },
      ];

  const activeFilterCount =
    catModes.size + (minLiquidity > 0 ? 1 : 0) + (timeLeft !== "any" ? 1 : 0);
  const clearAllFilters = () => {
    setCatModes(new Map());
    setTimeLeft("any");
    setMinLiquidity(0);
  };

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
          <div className="flex items-center gap-2 md:gap-2.5">
            <img
              src="/light.svg"
              alt="OnlyBonds"
              className="theme-logo-light h-5 md:h-7"
            />
            <img
              src="/dark.svg"
              alt="OnlyBonds"
              className="theme-logo-dark h-5 md:h-7"
            />
            <span
              className="text-[12px] md:text-[14px]"
              style={{ color: "var(--text-tertiary)" }}
            >
              <span
                style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}
              >
                by
              </span>{" "}
              <a
                href="https://x.com/rb_tweets"
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans"
                style={{
                  color: "var(--text-secondary)",
                  textDecoration: "underline",
                  textUnderlineOffset: "3px",
                }}
              >
                @rb_tweets
              </a>
            </span>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            {!loading && (
              <span
                className="hidden md:inline text-[14px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {fetchedAt}
              </span>
            )}
            <ThemeToggle />
            <PortfolioNavLink />
            <AuthButton />
          </div>
        </div>
      </nav>

      <div className="max-w-[1200px] mx-auto px-4 md:px-8 pt-8 md:pt-16 pb-16 md:pb-24">
        {/* Hero */}
        <div className="mb-8 md:mb-16">
          <h1
            className="text-[28px] md:text-[48px] font-bold tracking-[-0.02em] leading-[1.1] mb-2 md:mb-3"
            style={{ color: "var(--accent)" }}
          >
            High-probability bonds
          </h1>
          <p
            className="text-[15px] md:text-[18px] leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Near-certain Polymarket outcomes ranked by annualized yield.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 md:flex md:gap-16 mb-8 md:mb-16">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <div
                    className="skeleton mb-1"
                    style={{ width: 64 + i * 12, height: 28 }}
                  />
                  <div className="skeleton" style={{ width: 80, height: 14 }} />
                </div>
              ))
            : stats.map((s) => (
                <div key={s.label}>
                  <div
                    className="text-[24px] md:text-[36px] font-bold leading-none tracking-[-0.03em] font-mono mb-1"
                    style={{ color: s.color }}
                  >
                    {s.value}
                  </div>
                  <div
                    className="text-[13px] md:text-[14px]"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
        </div>

        {/* Threshold + Time */}
        <div className="flex items-center gap-2 md:gap-3 mb-4 overflow-x-auto no-scrollbar">
          {[0.9, 0.95, 0.97, 0.99].map((p) => (
            <FilterLink
              key={p}
              label={`${"\u2265"}${(p * 100).toFixed(0)}%`}
              active={minProb === p}
              onClick={() => {
                setMinProb(p);
                load(p);
              }}
            />
          ))}
          <span
            className="mx-1"
            style={{ color: "var(--text-tertiary)", opacity: 0.3 }}
          >
            |
          </span>
          {TIME_OPTS.map((o) => (
            <FilterLink
              key={o.value}
              label={o.label}
              active={timeFilter === o.value}
              onClick={() => setTimeFilter(o.value)}
            />
          ))}
          <div className="ml-auto">
            <button
              onClick={() => setShowDisputes((v) => !v)}
              className="flex items-center gap-1.5 text-[14px] md:text-[15px] cursor-pointer transition-colors whitespace-nowrap"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                color: showDisputes ? "var(--text)" : "var(--text-tertiary)",
                fontWeight: showDisputes ? 600 : 400,
                textDecoration: showDisputes ? "underline" : "none",
                textUnderlineOffset: "4px",
                textDecorationThickness: "2px",
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: "var(--red)" }}
              />
              Disputed{disputes.length > 0 ? ` (${disputes.length})` : ""}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div
          className="mb-4 md:mb-8"
          style={{ borderTop: "2px solid var(--text)", opacity: 0.12 }}
        />

        {/* Main table */}
        {!showDisputes && (
          <div>
            {/* Categories + Filter */}
            <div
              className="flex items-center gap-2 md:gap-3 mb-6 md:mb-8"
              ref={filterRef}
            >
              {/* Category pills — simple single-select */}
              <div className="flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar flex-1 min-w-0">
                <FilterLink
                  label="All"
                  active={catFilter === "all"}
                  onClick={() => setCatFilter("all")}
                />
                {categories.map((c) => (
                  <FilterLink
                    key={c}
                    label={c}
                    active={catFilter === c}
                    onClick={() => setCatFilter(c)}
                  />
                ))}
              </div>

              {/* Filter dropdown */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowFilter((v) => !v)}
                  className="flex items-center gap-1 text-[14px] md:text-[15px] cursor-pointer transition-colors"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    fontFamily: "inherit",
                    color:
                      activeFilterCount > 0
                        ? "var(--text)"
                        : "var(--text-tertiary)",
                    fontWeight: activeFilterCount > 0 ? 600 : 400,
                  }}
                >
                  Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                  <span style={{ fontSize: "11px", opacity: 0.6 }}>▾</span>
                </button>
                {showFilter && (
                  <div
                    className="absolute right-0 top-8 z-50 rounded-xl p-4 w-[280px]"
                    style={{
                      background: "#161b22",
                      border: "1px solid #1f2937",
                      boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                    }}
                  >
                    {/* Category include/exclude */}
                    <div className="mb-5">
                      <div
                        className="text-[11px] font-semibold uppercase tracking-wider mb-2.5"
                        style={{ color: "#6b7280" }}
                      >
                        Category
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {categories.map((c) => {
                          const mode = catModes.get(c);
                          return (
                            <button
                              key={c}
                              onClick={() =>
                                setCatModes((prev) => {
                                  const next = new Map(prev);
                                  if (!mode) next.set(c, "include");
                                  else if (mode === "include")
                                    next.set(c, "exclude");
                                  else next.delete(c);
                                  return next;
                                })
                              }
                              className="px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all"
                              style={{
                                background:
                                  mode === "include"
                                    ? "rgba(5,150,80,0.15)"
                                    : mode === "exclude"
                                      ? "rgba(220,38,38,0.12)"
                                      : "rgba(255,255,255,0.05)",
                                border: `1px solid ${mode === "include" ? "rgba(5,150,80,0.35)" : mode === "exclude" ? "rgba(220,38,38,0.3)" : "rgba(255,255,255,0.08)"}`,
                                color:
                                  mode === "include"
                                    ? "#4ade80"
                                    : mode === "exclude"
                                      ? "#f87171"
                                      : "#9ca3af",
                                textDecoration:
                                  mode === "exclude" ? "line-through" : "none",
                              }}
                            >
                              {c}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Time Left */}
                    <div className="mb-5">
                      <div
                        className="text-[11px] font-semibold uppercase tracking-wider mb-2.5"
                        style={{ color: "#6b7280" }}
                      >
                        Time Left
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            { v: "any", l: "Any" },
                            { v: "1h", l: "<1h" },
                            { v: "6h", l: "<6h" },
                            { v: "12h", l: "<12h" },
                            { v: "24h", l: "<24h" },
                            { v: "7d", l: "<7d" },
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.v}
                            onClick={() => setTimeLeft(o.v)}
                            className="px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all"
                            style={{
                              background:
                                timeLeft === o.v
                                  ? "rgba(23,94,202,0.2)"
                                  : "rgba(255,255,255,0.05)",
                              border: `1px solid ${timeLeft === o.v ? "rgba(23,94,202,0.5)" : "rgba(255,255,255,0.08)"}`,
                              color: timeLeft === o.v ? "#60a5fa" : "#9ca3af",
                            }}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Min Liquidity */}
                    <div className="mb-2">
                      <div
                        className="text-[11px] font-semibold uppercase tracking-wider mb-2.5"
                        style={{ color: "#6b7280" }}
                      >
                        Min Liquidity
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            { v: 0, l: "Any" },
                            { v: 1000, l: ">$1K" },
                            { v: 10000, l: ">$10K" },
                            { v: 100000, l: ">$100K" },
                          ] as const
                        ).map((o) => (
                          <button
                            key={o.v}
                            onClick={() => setMinLiquidity(o.v)}
                            className="px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-all"
                            style={{
                              background:
                                minLiquidity === o.v
                                  ? "rgba(23,94,202,0.2)"
                                  : "rgba(255,255,255,0.05)",
                              border: `1px solid ${minLiquidity === o.v ? "rgba(23,94,202,0.5)" : "rgba(255,255,255,0.08)"}`,
                              color:
                                minLiquidity === o.v ? "#60a5fa" : "#9ca3af",
                            }}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Clear all */}
                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="w-full text-left text-[12px] cursor-pointer mt-3 pt-3"
                        style={{
                          background: "none",
                          border: "none",
                          borderTop: "1px solid #1f2937",
                          color: "#6b7280",
                          fontFamily: "inherit",
                        }}
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Column headers — desktop only */}
            {!loading && displayed.length > 0 && (
              <div
                className="hidden md:grid py-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  gridTemplateColumns:
                    "24px 1fr 110px 100px 120px 90px 90px 72px",
                  color: "var(--text-tertiary)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div></div>
                <div>Market</div>
                {(["prob", "gain", "expiry"] as const).map((key, i) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sort === key) setSortAsc((v) => !v);
                      else {
                        setSort(key);
                        setSortAsc(false);
                      }
                    }}
                    className="text-left cursor-pointer flex items-center gap-1"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      fontWeight: "inherit",
                      letterSpacing: "inherit",
                      textTransform: "inherit",
                      color:
                        sort === key ? "var(--text)" : "var(--text-tertiary)",
                    }}
                  >
                    {["Odds", "Gain", "Expires"][i]}
                    <span
                      style={{
                        fontSize: "10px",
                        opacity: sort === key ? 1 : 0.3,
                      }}
                    >
                      {sort === key ? (sortAsc ? "↑" : "↓") : "↓"}
                    </span>
                  </button>
                ))}
                {(["volume", "liquidity"] as const).map((key, i) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sort === key) setSortAsc((v) => !v);
                      else {
                        setSort(key);
                        setSortAsc(false);
                      }
                    }}
                    className="text-right cursor-pointer flex items-center justify-end gap-1"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      fontWeight: "inherit",
                      letterSpacing: "inherit",
                      textTransform: "inherit",
                      color:
                        sort === key ? "var(--text)" : "var(--text-tertiary)",
                    }}
                  >
                    {["Vol", "Liq"][i]}
                    <span
                      style={{
                        fontSize: "10px",
                        opacity: sort === key ? 1 : 0.3,
                      }}
                    >
                      {sort === key ? (sortAsc ? "↑" : "↓") : "↓"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="py-4 md:grid md:items-center"
                    style={{
                      gridTemplateColumns:
                        "24px 1fr 110px 100px 120px 90px 90px 72px",
                      borderBottom: "1px solid var(--border)",
                      animationDelay: `${i * 0.05}s`,
                    }}
                  >
                    <div
                      className="hidden md:block skeleton"
                      style={{ width: 16, height: 16 }}
                    />
                    <div className="flex items-center gap-2 mb-2 md:mb-0 md:pr-8">
                      <div
                        className="md:hidden skeleton"
                        style={{ width: 14, height: 14, flexShrink: 0 }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: `${55 + (i % 4) * 10}%`, height: 16 }}
                      />
                    </div>
                    <div className="flex items-center gap-4 md:hidden pl-7">
                      <div
                        className="skeleton"
                        style={{ width: 48, height: 14 }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: 56, height: 14 }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: 44, height: 14 }}
                      />
                    </div>
                    <div
                      className="hidden md:block skeleton"
                      style={{ width: 56, height: 16 }}
                    />
                    <div
                      className="hidden md:block skeleton"
                      style={{ width: 64, height: 16 }}
                    />
                    <div
                      className="hidden md:block skeleton"
                      style={{ width: 72, height: 16 }}
                    />
                    <div className="hidden md:flex justify-end">
                      <div
                        className="skeleton"
                        style={{ width: 52, height: 16 }}
                      />
                    </div>
                    <div className="hidden md:flex justify-end">
                      <div
                        className="skeleton"
                        style={{ width: 52, height: 16 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center h-48 md:h-56 gap-3">
                <span
                  className="text-[16px] md:text-[18px] font-semibold"
                  style={{ color: "var(--red)" }}
                >
                  {error}
                </span>
                <button
                  onClick={() => load()}
                  className="text-[15px] font-semibold cursor-pointer"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent)",
                  }}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Empty */}
            {!loading && !error && displayed.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 md:h-56 gap-1">
                <span
                  className="text-[16px] md:text-[18px] font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  No bonds found
                </span>
                <span
                  className="text-[14px] md:text-[15px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  Try adjusting your filters
                </span>
              </div>
            )}

            {/* Rows */}
            {!loading && !error && (
              <>
                {pinnedRows.map((bond, i) => (
                  <BondRow key={bond.id} bond={bond} index={i} pinned />
                ))}
                {regularRows.map((bond, i) => (
                  <BondRow
                    key={bond.id}
                    bond={bond}
                    index={pinnedRows.length + i}
                  />
                ))}
              </>
            )}

            {/* Footer */}
            {!loading && !error && displayed.length > 0 && (
              <div className="flex justify-between items-center pt-6 mt-2">
                <span
                  className="text-[13px] md:text-[14px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {displayed.length} of {allBonds.length} markets
                </span>
                <span
                  className="hidden md:inline text-[13px] font-mono"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  APY = (1{"\u2212"}p)/p {"\u00d7"} 365/d
                </span>
              </div>
            )}
          </div>
        )}

        {/* Disputes */}
        {showDisputes && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6 md:mb-8">
              <div className="flex items-baseline gap-3">
                <span
                  className="text-[20px] md:text-[24px] font-bold tracking-[-0.02em]"
                  style={{ color: "var(--red)" }}
                >
                  UMA Disputed Markets
                </span>
                <span
                  className="text-[16px] md:text-[18px] font-bold"
                  style={{ color: "var(--red)", opacity: 0.5 }}
                >
                  {disputes.length}
                </span>
              </div>
              <div className="flex items-center gap-5">
                <a
                  href="https://oracle.uma.xyz/?project=Polymarket"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[14px] transition-colors"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  UMA Oracle {"\u2192"}
                </a>
                <button
                  onClick={() => setShowDisputes(false)}
                  className="text-[14px] font-semibold cursor-pointer transition-colors"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent)",
                  }}
                >
                  Back
                </button>
              </div>
            </div>
            {disputes.length > 0 && (
              <div
                className="hidden md:grid py-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
                style={{
                  gridTemplateColumns:
                    "24px 1fr 110px 100px 120px 90px 90px 72px",
                  color: "var(--text-tertiary)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div></div>
                <div>Market</div>
                {(["prob", "gain", "expiry"] as const).map((key, i) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sort === key) setSortAsc((v) => !v);
                      else {
                        setSort(key);
                        setSortAsc(false);
                      }
                    }}
                    className="text-left cursor-pointer flex items-center gap-1"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      fontWeight: "inherit",
                      letterSpacing: "inherit",
                      textTransform: "inherit",
                      color:
                        sort === key ? "var(--text)" : "var(--text-tertiary)",
                    }}
                  >
                    {["Odds", "Gain", "Expires"][i]}
                    <span
                      style={{
                        fontSize: "10px",
                        opacity: sort === key ? 1 : 0.3,
                      }}
                    >
                      {sort === key ? (sortAsc ? "↑" : "↓") : "↓"}
                    </span>
                  </button>
                ))}
                {(["volume", "liquidity"] as const).map((key, i) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sort === key) setSortAsc((v) => !v);
                      else {
                        setSort(key);
                        setSortAsc(false);
                      }
                    }}
                    className="text-right cursor-pointer flex items-center justify-end gap-1"
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      fontFamily: "inherit",
                      fontSize: "inherit",
                      fontWeight: "inherit",
                      letterSpacing: "inherit",
                      textTransform: "inherit",
                      color:
                        sort === key ? "var(--text)" : "var(--text-tertiary)",
                    }}
                  >
                    {["Vol", "Liq"][i]}
                    <span
                      style={{
                        fontSize: "10px",
                        opacity: sort === key ? 1 : 0.3,
                      }}
                    >
                      {sort === key ? (sortAsc ? "↑" : "↓") : "↓"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {disputes.length === 0 && (
              <div className="flex items-center justify-center h-40">
                <span
                  className="text-[16px] md:text-[18px] font-semibold"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  No active disputes
                </span>
              </div>
            )}
            {disputes.map((bond, i) => (
              <BondRow key={bond.id} bond={bond} index={i} />
            ))}
            {disputes.length > 0 && (
              <div className="pt-6 mt-2">
                <span
                  className="text-[14px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {disputes.length} disputed markets
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
