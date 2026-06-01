"use client";
import { memo, useState } from "react";
import { Bond, fmtGain, fmtVolume, fmtExpiry } from "@/lib/bonds";
import TradePanel from "./TradePanel";

interface Props {
  bond: Bond;
  index: number;
  compact?: boolean;
  pinned?: boolean;
}

export default memo(function BondRow({ bond, index, pinned }: Props) {
  const { label } = fmtExpiry(bond.endDate);
  const probPct = (bond.price * 100).toFixed(1);
  const url = `https://polymarket.com/event/${bond.slug}?via=onlybonds`;
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className="bond-row"
        style={{
          animationDelay: `${index * 0.03}s`,
          borderBottom: open ? "none" : "1px solid var(--border)",
        }}
      >
        {/* Main row */}
        <div
          className="py-4 md:grid md:items-center"
          style={{
            gridTemplateColumns: "24px 1fr 110px 100px 120px 90px 90px 72px",
          }}
        >
          {/* Spacer */}
          <div className="hidden md:block" />

          {/* Name */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:pr-8 min-w-0 flex items-center gap-2 mb-2 md:mb-0 bg-transparent border-none p-0 text-left cursor-pointer"
          >
            <div
              className="text-[15px] font-medium truncate leading-snug hover:opacity-70 transition-opacity"
              style={{ color: "var(--text)" }}
            >
              {bond.question}
            </div>
            {pinned && (
              <span
                className="hidden md:inline flex-shrink-0 text-[11px] font-semibold tracking-wide"
                style={{ color: "var(--purple)" }}
              >
                * featured
              </span>
            )}
          </button>

          {/* Mobile stats */}
          <div className="flex items-center gap-4 md:hidden">
            <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--green)" }}>
              {bond.outcome} {probPct}%
            </span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--green)" }}>
              {fmtGain(bond.price)}
            </span>
            <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {label}
            </span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto no-underline transition-opacity hover:opacity-70"
              style={{ color: "#60a5fa" }}
            >
              ↗
            </a>
          </div>

          {/* Desktop columns */}
          <div className="hidden md:flex items-center">
            <span className="text-[15px] font-bold tabular-nums" style={{ color: "var(--green)" }}>
              {bond.outcome} {probPct}%
            </span>
          </div>
          <div className="hidden md:flex items-center">
            <span className="text-[15px] font-bold tabular-nums" style={{ color: "var(--green)" }}>
              {fmtGain(bond.price)}
            </span>
          </div>
          <div className="hidden md:flex items-center">
            <span
              className="text-[14px] whitespace-nowrap"
              style={{ color: "var(--text-secondary)" }}
            >
              {label}
            </span>
          </div>
          <div className="hidden md:flex items-center justify-end">
            <span className="text-[14px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {fmtVolume(bond.volume)}
            </span>
          </div>
          <div className="hidden md:flex items-center justify-end">
            <span className="text-[14px] tabular-nums" style={{ color: "var(--text-tertiary)" }}>
              {fmtVolume(bond.liquidity)}
            </span>
          </div>

          {/* Arrow — links to Polymarket */}
          <div className="hidden md:flex items-center justify-end">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[16px] no-underline transition-opacity hover:opacity-70"
              style={{ color: "#60a5fa" }}
            >
              ↗
            </a>
          </div>
        </div>

        {/* Inline trade panel */}
        {open && <TradePanel bond={bond} onClose={() => setOpen(false)} />}
      </div>
    </>
  );
});
