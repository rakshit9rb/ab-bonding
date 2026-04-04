export interface Bond {
  id: string;
  question: string;
  slug: string;
  category: string;
  price: number; // YES probability 0–1
  apy: number | null; // annualised yield %
  endDate: string; // ISO string
  volume: number;
  liquidity: number;
}

export type TimeFilter = "all" | "hours" | "today" | "week" | "month";
export type SortKey = "apy" | "prob" | "expiry" | "volume" | "liquidity";
export type TimeLeft = "any" | "1h" | "6h" | "12h" | "24h" | "7d";

export function calcAPY(price: number, endDateStr: string): number | null {
  try {
    const end = new Date(endDateStr);
    const now = new Date();
    const days = (end.getTime() - now.getTime()) / 86400000;
    if (days <= 0) return null;
    const gain = (1 - price) / price;
    return gain * (365 / days) * 100;
  } catch {
    return null;
  }
}

// ── Client-side helpers ────────────────────────────────────────────────────
export function splitPinned(
  bonds: Bond[],
  pinnedMatches: string[],
): { pinned: Bond[]; regular: Bond[] } {
  const pinned: Bond[] = [];
  const regular: Bond[] = [];
  for (const b of bonds) {
    const title = b.question.toLowerCase();
    if (pinnedMatches.some((m) => title.includes(m.toLowerCase()))) pinned.push(b);
    else regular.push(b);
  }
  return { pinned, regular };
}

export function applyFilters(
  bonds: Bond[],
  timeFilter: TimeFilter,
  catFilter: string,
  catModes: Map<string, "include" | "exclude">,
  sort: SortKey,
  minLiquidity = 0,
  timeLeft: TimeLeft = "any",
  sortAsc = false,
): Bond[] {
  const now = new Date();
  const includedCats = Array.from(catModes.entries())
    .filter(([, v]) => v === "include")
    .map(([k]) => k);
  const excludedCats = Array.from(catModes.entries())
    .filter(([, v]) => v === "exclude")
    .map(([k]) => k);
  const timeLeftHours: Record<string, number> = {
    "1h": 1,
    "6h": 6,
    "12h": 12,
    "24h": 24,
    "7d": 168,
  };

  let filtered = bonds.filter((b) => {
    if (catFilter !== "all" && b.category !== catFilter) return false;
    if (includedCats.length > 0 && !includedCats.includes(b.category)) return false;
    if (excludedCats.includes(b.category)) return false;
    if (minLiquidity > 0 && b.liquidity < minLiquidity) return false;
    const end = new Date(b.endDate);
    const hours = (end.getTime() - now.getTime()) / 3600000;
    const days = hours / 24;
    if (timeLeft !== "any") {
      if (hours < 0 || hours > timeLeftHours[timeLeft]) return false;
    }
    if (timeFilter === "all") return true;
    if (timeFilter === "hours") return hours >= 0 && hours <= 24;
    if (timeFilter === "today") return end.toDateString() === now.toDateString();
    if (timeFilter === "week") return days >= 0 && days <= 7;
    if (timeFilter === "month") return days >= 0 && days <= 31;
    return true;
  });

  const dir = sortAsc ? 1 : -1;
  filtered.sort((a, b) => {
    if (sort === "apy") return dir * ((a.apy ?? 0) - (b.apy ?? 0));
    if (sort === "prob") return dir * (a.price - b.price);
    if (sort === "expiry")
      return dir * (new Date(a.endDate).getTime() - new Date(b.endDate).getTime());
    if (sort === "volume") return dir * (a.volume - b.volume);
    if (sort === "liquidity") return dir * (a.liquidity - b.liquidity);
    return 0;
  });

  return filtered;
}

export function fmtAPY(apy: number | null): string {
  if (apy == null) return "—";
  if (apy > 9999) return ">9999%";
  return apy.toFixed(1) + "%";
}

export function fmtVolume(v: number): string {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  if (v > 0) return "$" + Math.round(v);
  return "—";
}

export function fmtExpiry(endDateStr: string): {
  label: string;
  urgency: "critical" | "soon" | "normal";
} {
  if (!endDateStr) return { label: "—", urgency: "normal" };
  const end = new Date(endDateStr);
  if (isNaN(end.getTime())) return { label: "—", urgency: "normal" };
  // Polymarket uses 2026-12-31 as a placeholder for "no fixed end date"
  if (endDateStr.startsWith("2026-12-31")) return { label: "—", urgency: "normal" };
  const now = new Date();
  const hours = (end.getTime() - now.getTime()) / 3600000;
  const days = Math.floor(hours / 24);

  if (hours < 0) return { label: "Expired", urgency: "critical" };
  if (hours < 1 / 60) return { label: "< 1m left", urgency: "critical" };
  if (hours < 1) return { label: `${Math.round(hours * 60)}m left`, urgency: "critical" };
  if (hours < 24) return { label: `${Math.round(hours)}h left`, urgency: "critical" };
  if (days < 7) return { label: `${Math.round(hours)}h left`, urgency: "soon" };
  return { label: `${days}d left`, urgency: "normal" };
}

export function getCategories(bonds: Bond[]): string[] {
  const cats = Array.from(new Set(bonds.map((b) => b.category))).sort();
  return [...cats.filter((c) => c !== "Other"), ...cats.filter((c) => c === "Other")];
}
