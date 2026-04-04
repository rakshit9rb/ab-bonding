import "server-only";

import { Bond, calcAPY } from "@/lib/bonds";

const BOND_DATA_REVALIDATE_SECONDS = 60;
export const DEFAULT_MIN_PROBABILITY = 0.95;

const GAMMA_API_BASE = "https://gamma-api.polymarket.com";
const CLOB_API_BASE = "https://clob.polymarket.com";
const EVENT_PAGE_SIZE = 50;
const ACTIVE_MARKET_PAGE_SIZE = 200;
const MAX_EVENT_PAGE_COUNT = 100;
const MARKET_DISCOVERY_SORT_KEY = "volume24hr";
const CLOB_BOOK_BATCH_SIZE = 50;
const FETCH_WINDOW_SIZE = 8;
const FIXED_END_DATE_PLACEHOLDER = "2026-12-31";
const REQUEST_HEADERS = { "User-Agent": "OnlyBonds/1.0" };

type RawMarket = Record<string, unknown>;
type RawEvent = Record<string, unknown>;
type RawOrderBook = Record<string, unknown>;
type MarketUniverseCacheEntry = {
  expiresAt: number;
  promise: Promise<RawMarket[]>;
};

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

function toEventList(value: unknown): RawEvent[] {
  if (Array.isArray(value))
    return value.filter((item): item is RawEvent => typeof item === "object" && item !== null);
  if (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { events?: unknown }).events)
  ) {
    return (value as { events: unknown[] }).events.filter(
      (item): item is RawEvent => typeof item === "object" && item !== null,
    );
  }
  return [];
}

function toOrderBookList(value: unknown): RawOrderBook[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RawOrderBook => typeof item === "object" && item !== null);
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    if (normalised === "true") return true;
    if (normalised === "false") return false;
  }
  return null;
}

const marketUniverseCache = new Map<string, MarketUniverseCacheEntry>();

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
  return getFirstFiniteNumber(market, [
    "liquidityNum",
    "liquidityClob",
    "liquidity",
    "liquidityAmm",
  ]);
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
  const method = init.method?.toUpperCase() ?? "GET";
  const response = await fetch(url, {
    ...init,
    headers: { ...REQUEST_HEADERS, ...init.headers },
    ...(method === "GET" || method === "HEAD"
      ? { next: { revalidate: BOND_DATA_REVALIDATE_SECONDS } }
      : {}),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function isOpenMarket(market: RawMarket): boolean {
  return (
    parseBoolean(market.active) !== false &&
    parseBoolean(market.closed) !== true &&
    parseBoolean(market.archived) !== true
  );
}

function mergeMarketWithEventContext(market: RawMarket, event: RawEvent): RawMarket {
  return {
    ...market,
    ...(market.category ? null : { category: event.category }),
    ...(market.tags ? null : { tags: event.tags }),
    ...(market.events || !event.slug ? null : { events: [{ slug: event.slug }] }),
  };
}

function getEventMarkets(event: RawEvent): RawMarket[] {
  const rawMarkets = Array.isArray(event.markets)
    ? event.markets.filter((item): item is RawMarket => typeof item === "object" && item !== null)
    : [];

  return rawMarkets
    .map((market) => mergeMarketWithEventContext(market, event))
    .filter((market) => isOpenMarket(market));
}

async function fetchEventMarketUniverse(sortKey: string): Promise<RawMarket[]> {
  const markets: RawMarket[] = [];

  for (let startPage = 0; startPage < MAX_EVENT_PAGE_COUNT; startPage += FETCH_WINDOW_SIZE) {
    const pageResults = await Promise.all(
      Array.from(
        { length: Math.min(FETCH_WINDOW_SIZE, MAX_EVENT_PAGE_COUNT - startPage) },
        async (_, offset) => {
          const page = startPage + offset;
          const payload = await fetchJson(
            `${GAMMA_API_BASE}/events?active=true&closed=false&archived=false&limit=${EVENT_PAGE_SIZE}&offset=${page * EVENT_PAGE_SIZE}&order=${sortKey}&ascending=false`,
          );
          return toEventList(payload);
        },
      ),
    );

    for (const events of pageResults) {
      if (events.length === 0) return dedupeMarkets(markets);

      markets.push(...events.flatMap((event) => getEventMarkets(event)));
      if (events.length < EVENT_PAGE_SIZE) return dedupeMarkets(markets);
    }
  }

  return dedupeMarkets(markets);
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

async function fetchMarketUniverse(sortKey: string): Promise<RawMarket[]> {
  try {
    const eventMarkets = await fetchEventMarketUniverse(sortKey);
    if (eventMarkets.length > 0) return eventMarkets;
  } catch {}

  const markets: RawMarket[] = [];

  for (let startPage = 0; startPage < MAX_EVENT_PAGE_COUNT; startPage += FETCH_WINDOW_SIZE) {
    const pageResults = await Promise.allSettled(
      Array.from(
        { length: Math.min(FETCH_WINDOW_SIZE, MAX_EVENT_PAGE_COUNT - startPage) },
        async (_, offset) => {
          const page = startPage + offset;
          const payload = await fetchJson(
            `${GAMMA_API_BASE}/markets?closed=false&archived=false&active=true&limit=${ACTIVE_MARKET_PAGE_SIZE}&offset=${page * ACTIVE_MARKET_PAGE_SIZE}&order=${sortKey}&ascending=false`,
          );
          return toMarketList(payload).filter((market) => isOpenMarket(market));
        },
      ),
    );

    for (const result of pageResults) {
      if (result.status !== "fulfilled") return dedupeMarkets(markets);

      const pageMarkets = result.value;
      if (pageMarkets.length === 0) return dedupeMarkets(markets);

      markets.push(...pageMarkets);
      if (pageMarkets.length < ACTIVE_MARKET_PAGE_SIZE) return dedupeMarkets(markets);
    }
  }

  return dedupeMarkets(markets);
}

function getCachedMarketUniverse(sortKey: string): Promise<RawMarket[]> {
  const now = Date.now();
  const cached = marketUniverseCache.get(sortKey);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = fetchMarketUniverse(sortKey).catch((error) => {
    const latest = marketUniverseCache.get(sortKey);
    if (latest?.promise === promise) marketUniverseCache.delete(sortKey);
    throw error;
  });

  marketUniverseCache.set(sortKey, {
    expiresAt: now + BOND_DATA_REVALIDATE_SECONDS * 1000,
    promise,
  });

  return promise;
}

function getOutcomeLabels(market: RawMarket): string[] {
  return parseStringArray(market.outcomes);
}

function getYesTokenId(market: RawMarket): string | null {
  const tokenIds = parseStringArray(market.clobTokenIds);
  const outcomeLabels = getOutcomeLabels(market);
  const yesOutcomeIndex = outcomeLabels.findIndex((label) => label.trim().toLowerCase() === "yes");

  if (yesOutcomeIndex >= 0 && yesOutcomeIndex < tokenIds.length) return tokenIds[yesOutcomeIndex]!;
  if (tokenIds.length > 0) return tokenIds[0]!;

  if (!Array.isArray(market.tokens)) return null;

  const yesToken = market.tokens.find((token) => {
    if (typeof token !== "object" || token === null) return false;
    return (
      String((token as { outcome?: unknown }).outcome ?? "")
        .trim()
        .toLowerCase() === "yes"
    );
  }) as { tokenId?: unknown; clobTokenId?: unknown; id?: unknown } | undefined;

  return String(yesToken?.tokenId || yesToken?.clobTokenId || yesToken?.id || "") || null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function enrichLiquidityFromClob(bonds: Bond[], tokenIdToIndex: Map<string, number>) {
  if (tokenIdToIndex.size === 0) return;

  const tokenIds = Array.from(tokenIdToIndex.keys());
  const clobResults = await Promise.allSettled(
    chunk(tokenIds, CLOB_BOOK_BATCH_SIZE).map((tokenIdBatch) =>
      fetchJson(`${CLOB_API_BASE}/books`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenIdBatch.map((tokenId) => ({ token_id: tokenId }))),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }),
    ),
  );

  const orderBooks = clobResults.flatMap((result) =>
    result.status === "fulfilled" ? toOrderBookList(result.value) : [],
  );

  for (const orderBook of orderBooks) {
    const assetId = String(orderBook.asset_id || orderBook.assetId || "");
    if (!assetId) continue;

    const asks = Array.isArray(orderBook.asks)
      ? (orderBook.asks as Array<{ price?: unknown; size?: unknown }>)
      : [];

    const liquidity = asks.reduce((sum, ask) => {
      const price = parseNumber(ask.price);
      const size = parseNumber(ask.size);
      return price == null || size == null ? sum : sum + price * size;
    }, 0);

    if (liquidity <= 0) continue;

    const bondIndex = tokenIdToIndex.get(assetId);
    if (bondIndex == null) continue;
    if (bonds[bondIndex].liquidity <= 0) bonds[bondIndex].liquidity = liquidity;
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
  const markets = await getCachedMarketUniverse(MARKET_DISCOVERY_SORT_KEY);
  const bonds: Bond[] = [];
  const tokenIdToIndex = new Map<string, number>();
  const now = new Date();

  for (const market of markets) {
    const price = parsePrice(market);
    const endDate = parseEndDate(market);

    if (price == null || price < minProb || price >= 0.9995) continue;
    if (!isActiveEndDate(endDate, now)) continue;

    const bondIndex = bonds.length;
    const bond = toBond(market, getCategory(market), price, endDate);
    bonds.push(bond);

    const yesTokenId = getYesTokenId(market);
    if (yesTokenId && bond.liquidity <= 0) tokenIdToIndex.set(yesTokenId, bondIndex);
  }

  await enrichLiquidityFromClob(bonds, tokenIdToIndex);

  return bonds;
}

export async function fetchDisputedBonds(): Promise<Bond[]> {
  const markets = await getCachedMarketUniverse(MARKET_DISCOVERY_SORT_KEY);
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
