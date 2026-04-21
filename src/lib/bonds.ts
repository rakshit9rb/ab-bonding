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
  clobTokenIds: [string, string] | null; // [yesTokenId, noTokenId]
  negRisk: boolean;
  conditionId: string;
}

export type TimeFilter = "all" | "hours" | "today" | "week" | "month";
export type SortKey =
  | "gain"
  | "apy"
  | "prob"
  | "expiry"
  | "volume"
  | "liquidity";
export type TimeLeft = "any" | "1h" | "6h" | "12h" | "24h" | "7d";

const GAMMA = "https://gamma-api.polymarket.com";

function parsePrice(m: Record<string, unknown>): number | null {
  try {
    if (m.outcomePrices) {
      const prices =
        typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices as string)
          : m.outcomePrices;
      return parseFloat((prices as string[])[0]);
    }
    for (const key of ["lastTradePrice", "price", "bestAsk"]) {
      if (m[key] != null) return parseFloat(m[key] as string);
    }
  } catch {}
  return null;
}

function parseEndDate(m: Record<string, unknown>): string | null {
  return (m.endDate || m.endDateIso || null) as string | null;
}

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

const CATEGORY_RULES: [string, RegExp][] = [
  [
    "Crypto",
    /\b(bitcoin|btc|ethereum|eth|crypto|solana|sol|xrp|ripple|doge|dogecoin|bnb|usdc|usdt|stablecoin|defi|nft|blockchain|altcoin|coinbase|binance|token|web3|memecoin|pepe|shib)\b/i,
  ],
  [
    "Politics",
    /\b(election|president|congress|senate|democrat|republican|trump|biden|harris|vote|ballot|governor|parliament|prime minister|chancellor|cabinet|white house|supreme court|impeach|campaign|poll|gop|labour|tory|macron|modi|xi jinping|zelensky|putin|war|invasion|nato|ukraine|russia|china|taiwan|conflict|military|sanction|ceasefire|troops|missile|nuclear|treaty|diplomacy|middle east|israel|gaza|iran|north korea)\b/i,
  ],
  [
    "Finance",
    /\b(fed|federal reserve|inflation|gdp|interest rate|recession|cpi|unemployment|jobs report|rate cut|rate hike|treasury|dollar|euro|forex|oil|crude|brent|gold|silver|commodity|imf|world bank|tariff|trade war|deficit|debt ceiling|stock|s&p|nasdaq|dow|earnings|ipo|acquisition|merger|hedge fund|bonds|yield|equity|etf|fomc|ecb|bank of england|boe)\b/i,
  ],
  [
    "Sports",
    /\b(nba|nfl|mlb|nhl|ufc|fifa|premier league|champions league|super bowl|world cup|olympics|championship|nascar|formula 1|f1|tennis|wimbledon|grand slam|playoffs|finals|mvp|transfer|draft|cricket|ipl|rugby|golf|pga)\b/i,
  ],
  [
    "Technology",
    /\b(ai|artificial intelligence|openai|chatgpt|gpt|llm|apple|google|microsoft|meta|amazon|nvidia|tesla|spacex|robot|autonomous|chip|semiconductor|iphone|android|antitrust|ipo|startup|doge|department of government efficiency)\b/i,
  ],
  [
    "Science",
    /\b(climate|global warming|co2|emissions|pandemic|vaccine|fda|drug approval|cancer|virus|covid|health|nasa|space|moon|mars|asteroid|discovery|earthquake|volcano)\b/i,
  ],
  [
    "Weather",
    /\b(hurricane|typhoon|cyclone|tornado|flood|drought|storm|blizzard|wildfire|heat wave|el ni[nñ]o|la ni[nñ]a|monsoon|snowfall|rainfall|temperature record|sea level)\b/i,
  ],
  [
    "Entertainment",
    /\b(oscar|grammy|emmy|golden globe|box office|movie|film|music|album|artist|celebrity|award|netflix|disney|hollywood|tv show|streaming)\b/i,
  ],
];

function getCategory(m: Record<string, unknown>): string {
  // Prefer explicit API category/tags if meaningful
  const apiCat = (() => {
    if (m.category) return String(m.category).trim();
    const tags = m.tags as Array<string | { label?: string }> | undefined;
    if (tags && tags.length > 0) {
      const t = tags[0];
      return typeof t === "object" ? (t.label ?? "") : String(t);
    }
    return "";
  })();
  if (
    apiCat &&
    apiCat.toLowerCase() !== "other" &&
    apiCat.toLowerCase() !== "unknown"
  ) {
    return apiCat;
  }

  // Infer from question text
  const text = String(m.question || m.title || "");
  for (const [cat, regex] of CATEGORY_RULES) {
    if (regex.test(text)) return cat;
  }
  return "Other";
}

function getVolume(m: Record<string, unknown>): number {
  for (const key of ["volumeNum", "volumeClob", "volume", "volume24hr"]) {
    if (m[key] != null) {
      const v = parseFloat(m[key] as string);
      if (!isNaN(v)) return v;
    }
  }
  return 0;
}

function getLiquidity(m: Record<string, unknown>): number {
  for (const key of ["liquidityNum", "liquidityClob", "liquidity"]) {
    if (m[key] != null) {
      const v = parseFloat(m[key] as string);
      if (!isNaN(v)) return v;
    }
  }
  return 0;
}

// Server-side only — called from API route
export async function fetchBonds(minProb = 0.9): Promise<Bond[]> {
  const PAGES = 25;
  const LIMIT = 200;
  const SORT_KEYS = ["volume24hr", "liquidity", "lastTradePrice", "startDate"];

  const pageUrls: string[] = [];
  for (const order of SORT_KEYS) {
    for (let page = 0; page < PAGES; page++) {
      pageUrls.push(
        `${GAMMA}/markets?closed=false&archived=false&active=true&limit=${LIMIT}&offset=${page * LIMIT}&order=${order}&ascending=false`,
      );
    }
  }

  const results = await Promise.allSettled(
    pageUrls.map((url) =>
      fetch(url, {
        headers: { "User-Agent": "OnlyBonds/1.0" },
        next: { revalidate: 60 },
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
    ),
  );

  const seen = new Set<string>();
  let raw: Record<string, unknown>[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const data = result.value;
    const page: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : (data.markets ?? []);
    for (const m of page) {
      const id = String(m.conditionId || m.id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      raw.push(m);
    }
  }

  // Fallback if all parallel fetches failed
  if (raw.length === 0) {
    try {
      const res = await fetch(`${GAMMA}/markets?closed=false&limit=${LIMIT}`, {
        headers: { "User-Agent": "OnlyBonds/1.0" },
        next: { revalidate: 60 },
      });
      if (res.ok) {
        const data = await res.json();
        raw = Array.isArray(data) ? data : (data.markets ?? []);
      }
    } catch {}
  }

  const now = new Date();
  const bonds: Bond[] = [];
  // tokenId → index in bonds array (for CLOB enrichment)
  const tokenIdToIdx = new Map<string, number>();

  for (const m of raw) {
    const price = parsePrice(m);
    if (price == null || price < minProb || price >= 0.9995) continue;
    const endDate = parseEndDate(m);
    if (!endDate) continue;
    if (new Date(endDate) <= now) continue;

    const idx = bonds.length;
    let clobTokenIds: [string, string] | null = null;
    try {
      const raw_ids = m.clobTokenIds;
      const ids: string[] =
        typeof raw_ids === "string"
          ? JSON.parse(raw_ids)
          : ((raw_ids as string[]) ?? []);
      if (ids[0] && ids[1]) clobTokenIds = [ids[0], ids[1]];
      else if (ids[0]) clobTokenIds = [ids[0], ids[0]];
    } catch {}

    const conditionId = String(m.conditionId || m.id || Math.random());
    bonds.push({
      id: conditionId,
      conditionId,
      question: String(m.question || m.title || "Unknown"),
      slug: String(
        (Array.isArray(m.events) && m.events.length > 0
          ? (m.events as any[])[0]?.slug
          : null) ||
          m.slug ||
          m.conditionId ||
          "",
      ),
      category: getCategory(m),
      price,
      apy: calcAPY(price, endDate),
      endDate,
      volume: getVolume(m),
      liquidity: getLiquidity(m),
      clobTokenIds,
      negRisk: Boolean(m.negRisk),
    });

    if (clobTokenIds?.[0]) tokenIdToIdx.set(clobTokenIds[0], idx);
  }

  // Enrich liquidity from CLOB order book — only top 100 markets by volume
  // to avoid hundreds of outbound requests slowing the response
  const topTokenIds = Array.from(tokenIdToIdx.keys())
    .sort(
      (a, b) =>
        bonds[tokenIdToIdx.get(b)!].volume - bonds[tokenIdToIdx.get(a)!].volume,
    )
    .slice(0, 100);
  const topTokenIdSet = new Set(topTokenIds);
  for (const id of Array.from(tokenIdToIdx.keys())) {
    if (!topTokenIdSet.has(id)) tokenIdToIdx.delete(id);
  }

  if (tokenIdToIdx.size > 0) {
    const CLOB = "https://clob.polymarket.com";
    const tokenIds = Array.from(tokenIdToIdx.keys());
    const clobResults = await Promise.allSettled(
      tokenIds.map((id) =>
        fetch(`${CLOB}/book?token_id=${id}`, {
          headers: { "User-Agent": "OnlyBonds/1.0" },
          signal: AbortSignal.timeout(8000),
          next: { revalidate: 60 },
        } as RequestInit).then((r) => (r.ok ? r.json() : null)),
      ),
    );

    for (let i = 0; i < tokenIds.length; i++) {
      const result = clobResults[i];
      if (result.status !== "fulfilled" || !result.value) continue;
      const book = result.value;
      const asks: { price: string; size: string }[] = Array.isArray(book.asks)
        ? book.asks
        : [];
      const liquidity = asks.reduce((sum, ask) => {
        const p = parseFloat(ask.price);
        const s = parseFloat(ask.size);
        return isNaN(p) || isNaN(s) ? sum : sum + p * s;
      }, 0);
      if (liquidity > 0) {
        const idx = tokenIdToIdx.get(tokenIds[i])!;
        bonds[idx].liquidity = liquidity;
      }
    }
  }

  return bonds;
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
    if (pinnedMatches.some((m) => title.includes(m.toLowerCase())))
      pinned.push(b);
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
    if (includedCats.length > 0 && !includedCats.includes(b.category))
      return false;
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
    if (timeFilter === "today")
      return end.toDateString() === now.toDateString();
    if (timeFilter === "week") return days >= 0 && days <= 7;
    if (timeFilter === "month") return days >= 0 && days <= 31;
    return true;
  });

  const dir = sortAsc ? 1 : -1;
  filtered.sort((a, b) => {
    if (sort === "gain")
      return dir * ((1 - a.price) / a.price - (1 - b.price) / b.price);
    if (sort === "apy") return dir * ((a.apy ?? 0) - (b.apy ?? 0));
    if (sort === "prob") return dir * (a.price - b.price);
    if (sort === "expiry")
      return (
        dir * (new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
      );
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

export function fmtGain(price: number): string {
  const gain = ((1 - price) / price) * 100;
  return gain.toFixed(2) + "%";
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
  if (endDateStr.startsWith("2026-12-31"))
    return { label: "—", urgency: "normal" };
  const now = new Date();
  const hours = (end.getTime() - now.getTime()) / 3600000;
  const days = Math.floor(hours / 24);

  if (hours < 0) return { label: "Expired", urgency: "critical" };
  if (hours < 1 / 60) return { label: "< 1m left", urgency: "critical" };
  if (hours < 1)
    return { label: `${Math.round(hours * 60)}m left`, urgency: "critical" };
  if (hours < 24)
    return { label: `${Math.round(hours)}h left`, urgency: "critical" };
  if (days < 7) return { label: `${Math.round(hours)}h left`, urgency: "soon" };
  return { label: `${days}d left`, urgency: "normal" };
}

export function getCategories(bonds: Bond[]): string[] {
  const cats = Array.from(new Set(bonds.map((b) => b.category))).sort();
  return [
    ...cats.filter((c) => c !== "Other"),
    ...cats.filter((c) => c === "Other"),
  ];
}
