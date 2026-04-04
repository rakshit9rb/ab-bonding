import "server-only";

import { Bond, calcAPY } from "@/lib/bonds";

const BOND_DATA_REVALIDATE_SECONDS = 60;
export const DEFAULT_MIN_PROBABILITY = 0.95;

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const ACTIVE_MARKET_PAGE_COUNT = 5;
const ACTIVE_MARKET_PAGE_SIZE = 200;
const ACTIVE_MARKET_SORT_KEYS = ["volume24hr", "liquidity"] as const;
const DISPUTED_MARKET_SORT_KEYS = ["volume24hr"] as const;
const FIXED_END_DATE_PLACEHOLDER = "2026-12-31";
const REQUEST_HEADERS = { "User-Agent": "OnlyBonds/1.0" };

type RawMarket = Record<string, unknown>;

function parseNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStringArray(value: unknown): string[] {
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function isMarketEnvelope(value: unknown): value is { markets?: unknown } {
  return typeof value === "object" && value !== null;
}

function toMarketList(value: unknown): RawMarket[] {
  if (Array.isArray(value))
    return value.filter((item): item is RawMarket => typeof item === "object" && item !== null);
  if (isMarketEnvelope(value) && Array.isArray(value.markets)) {
    return value.markets.filter(
      (item): item is RawMarket => typeof item === "object" && item !== null,
    );
  }
  return [];
}

function getMarketId(market: RawMarket): string {
  return String(market.conditionId || market.id || "");
}

function getMarketQuestion(market: RawMarket): string {
  return String(market.question || market.title || "Unknown");
}

function getMarketSlug(market: RawMarket): string {
  return String(
    (Array.isArray(market.events) && market.events.length > 0
      ? (market.events as Array<{ slug?: unknown }>)[0]?.slug
      : null) ||
      market.slug ||
      market.conditionId ||
      "",
  );
}

function parsePrice(market: RawMarket): number | null {
  try {
    if (market.outcomePrices) {
      const prices =
        typeof market.outcomePrices === "string"
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices;
      return parseNumber((prices as string[])[0]);
    }

    for (const key of ["lastTradePrice", "price", "bestAsk"]) {
      const value = parseNumber(market[key]);
      if (value != null) return value;
    }
  } catch {}

  return null;
}

function parseEndDate(market: RawMarket): string {
  return String(market.endDate || market.endDateIso || "");
}

function hasFixedEndDate(endDate: string): boolean {
  return Boolean(endDate) && !endDate.startsWith(FIXED_END_DATE_PLACEHOLDER);
}

function isActiveEndDate(endDate: string, now: Date): boolean {
  if (!endDate) return false;
  if (!hasFixedEndDate(endDate)) return true;
  return new Date(endDate) > now;
}

function getFirstFiniteNumber(market: RawMarket, keys: string[]): number {
  for (const key of keys) {
    const value = parseNumber(market[key]);
    if (value != null) return value;
  }
  return 0;
}

function getVolume(market: RawMarket): number {
  return getFirstFiniteNumber(market, ["volumeNum", "volumeClob", "volume", "volume24hr"]);
}

function getLiquidity(market: RawMarket): number {
  return getFirstFiniteNumber(market, ["liquidityNum", "liquidityClob", "liquidity"]);
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

function getCategory(market: RawMarket): string {
  const apiCategory = (() => {
    if (market.category) return String(market.category).trim();
    const tags = market.tags as Array<string | { label?: string }> | undefined;
    if (!tags?.length) return "";
    const firstTag = tags[0];
    return typeof firstTag === "object" ? (firstTag.label ?? "") : String(firstTag);
  })();

  if (
    apiCategory &&
    apiCategory.toLowerCase() !== "other" &&
    apiCategory.toLowerCase() !== "unknown"
  ) {
    return apiCategory;
  }

  const text = getMarketQuestion(market);
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }

  return "Other";
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { ...REQUEST_HEADERS, ...init.headers },
    next: { revalidate: BOND_DATA_REVALIDATE_SECONDS },
  } as RequestInit & { next: { revalidate: number } });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function buildMarketUrls(sortKeys: readonly string[]): string[] {
  const urls: string[] = [];

  for (const sortKey of sortKeys) {
    for (let page = 0; page < ACTIVE_MARKET_PAGE_COUNT; page++) {
      urls.push(
        `${GAMMA_API_BASE}/markets?closed=false&archived=false&active=true&limit=${ACTIVE_MARKET_PAGE_SIZE}&offset=${page * ACTIVE_MARKET_PAGE_SIZE}&order=${sortKey}&ascending=false`,
      );
    }
  }

  return urls;
}

function dedupeMarkets(markets: RawMarket[]): RawMarket[] {
  const seen = new Set<string>();
  const deduped: RawMarket[] = [];

  for (const market of markets) {
    const id = getMarketId(market);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push(market);
  }

  return deduped;
}

async function fetchMarketUniverse(sortKeys: readonly string[]): Promise<RawMarket[]> {
  const pageResults = await Promise.allSettled(
    buildMarketUrls(sortKeys).map((url) => fetchJson(url)),
  );
  const markets = dedupeMarkets(
    pageResults.flatMap((result) =>
      result.status === "fulfilled" ? toMarketList(result.value) : [],
    ),
  );

  if (markets.length > 0) return markets;

  try {
    const fallback = await fetchJson(
      `${GAMMA_API_BASE}/markets?closed=false&limit=${ACTIVE_MARKET_PAGE_SIZE}`,
    );
    return dedupeMarkets(toMarketList(fallback));
  } catch {
    return [];
  }
}

function getYesTokenId(market: RawMarket): string | null {
  const tokenIds = parseStringArray(market.clobTokenIds);
  return tokenIds[0] ?? null;
}

async function enrichLiquidityFromClob(bonds: Bond[], tokenIdToIndex: Map<string, number>) {
  if (tokenIdToIndex.size === 0) return;

  const tokenIds = Array.from(tokenIdToIndex.keys());
  const clobResults = await Promise.allSettled(
    tokenIds.map((tokenId) =>
      fetchJson(`${CLOB_API_BASE}/book?token_id=${tokenId}`, {
        signal: AbortSignal.timeout(8000),
      }),
    ),
  );

  for (let index = 0; index < tokenIds.length; index++) {
    const result = clobResults[index];
    if (result.status !== "fulfilled" || typeof result.value !== "object" || result.value === null)
      continue;

    const asks = Array.isArray((result.value as { asks?: unknown }).asks)
      ? (result.value as { asks: Array<{ price?: unknown; size?: unknown }> }).asks
      : [];

    const liquidity = asks.reduce((sum, ask) => {
      const price = parseNumber(ask.price);
      const size = parseNumber(ask.size);
      return price == null || size == null ? sum : sum + price * size;
    }, 0);

    if (liquidity <= 0) continue;

    const bondIndex = tokenIdToIndex.get(tokenIds[index]);
    if (bondIndex != null) bonds[bondIndex].liquidity = liquidity;
  }
}

function parseUmaStatuses(market: RawMarket): string[] {
  return parseStringArray(market.umaResolutionStatuses);
}

function toBond(market: RawMarket, category: string, price: number, endDate: string): Bond {
  return {
    id: getMarketId(market),
    question: getMarketQuestion(market),
    slug: getMarketSlug(market),
    category,
    price,
    apy: hasFixedEndDate(endDate) ? calcAPY(price, endDate) : null,
    endDate,
    volume: getVolume(market),
    liquidity: getLiquidity(market),
  };
}

export function parseMinProbability(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "");
  if (!Number.isFinite(parsed)) return DEFAULT_MIN_PROBABILITY;
  return Math.min(Math.max(parsed, 0), 0.9994);
}

export async function fetchBonds(minProb = DEFAULT_MIN_PROBABILITY): Promise<Bond[]> {
  const markets = await fetchMarketUniverse(ACTIVE_MARKET_SORT_KEYS);
  const bonds: Bond[] = [];
  const tokenIdToIndex = new Map<string, number>();
  const now = new Date();

  for (const market of markets) {
    const price = parsePrice(market);
    const endDate = parseEndDate(market);

    if (price == null || price < minProb || price >= 0.9995) continue;
    if (!isActiveEndDate(endDate, now)) continue;

    const bondIndex = bonds.length;
    bonds.push(toBond(market, getCategory(market), price, endDate));

    const yesTokenId = getYesTokenId(market);
    if (yesTokenId) tokenIdToIndex.set(yesTokenId, bondIndex);
  }

  await enrichLiquidityFromClob(bonds, tokenIdToIndex);

  return bonds;
}

export async function fetchDisputedBonds(): Promise<Bond[]> {
  const markets = await fetchMarketUniverse(DISPUTED_MARKET_SORT_KEYS);
  const now = new Date();

  return markets.flatMap((market) => {
    const statuses = parseUmaStatuses(market);
    if (!statuses.length || statuses[statuses.length - 1] !== "disputed") return [];

    const endDate = parseEndDate(market);
    if (!isActiveEndDate(endDate, now)) return [];

    const price = parsePrice(market) ?? 0;
    return [toBond(market, "Disputed", price, endDate)];
  });
}
