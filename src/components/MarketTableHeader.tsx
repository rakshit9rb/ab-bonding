import { SortKey } from "@/lib/bonds";

interface MarketTableHeaderProps {
  sort: SortKey;
  sortAsc: boolean;
  onSortChange: (key: SortKey) => void;
}

const LEFT_COLUMNS: Array<{
  key: Extract<SortKey, "prob" | "apy" | "expiry">;
  label: string;
}> = [
  { key: "prob", label: "Odds" },
  { key: "apy", label: "APY" },
  { key: "expiry", label: "Expires" },
];

const RIGHT_COLUMNS: Array<{
  key: Extract<SortKey, "volume" | "liquidity">;
  label: string;
}> = [
  { key: "volume", label: "Vol" },
  { key: "liquidity", label: "Liq" },
];

export default function MarketTableHeader({ sort, sortAsc, onSortChange }: MarketTableHeaderProps) {
  return (
    <div
      className="hidden md:grid py-3 text-[13px] font-semibold uppercase tracking-[0.06em]"
      style={{
        gridTemplateColumns: "24px 1fr 110px 100px 120px 90px 90px",
        color: "var(--text-tertiary)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div></div>
      <div>Market</div>
      {LEFT_COLUMNS.map((column) => (
        <button
          key={column.key}
          onClick={() => onSortChange(column.key)}
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
            color: sort === column.key ? "var(--text)" : "var(--text-tertiary)",
          }}
        >
          {column.label}
          <span style={{ fontSize: "10px", opacity: sort === column.key ? 1 : 0.3 }}>
            {sort === column.key ? (sortAsc ? "↑" : "↓") : "↓"}
          </span>
        </button>
      ))}
      {RIGHT_COLUMNS.map((column) => (
        <button
          key={column.key}
          onClick={() => onSortChange(column.key)}
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
            color: sort === column.key ? "var(--text)" : "var(--text-tertiary)",
          }}
        >
          {column.label}
          <span style={{ fontSize: "10px", opacity: sort === column.key ? 1 : 0.3 }}>
            {sort === column.key ? (sortAsc ? "↑" : "↓") : "↓"}
          </span>
        </button>
      ))}
    </div>
  );
}
