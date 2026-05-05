export interface GeoblockResult {
  blocked: boolean;
  source: "headers" | "polymarket";
  country?: string;
  region?: string;
  ip?: string;
  reason?: string;
}

const BLOCKED_COUNTRIES = new Set([
  "AU",
  "BE",
  "BY",
  "BI",
  "CF",
  "CD",
  "CU",
  "DE",
  "ET",
  "FR",
  "GB",
  "IR",
  "IQ",
  "IT",
  "KP",
  "LB",
  "LY",
  "MM",
  "NI",
  "NL",
  "PL",
  "RU",
  "SG",
  "SO",
  "SS",
  "SD",
  "SY",
  "TH",
  "TW",
  "UM",
  "US",
  "VE",
  "YE",
  "ZW",
]);

const BLOCKED_REGIONS = new Set(["CA-ON", "UA-43", "UA-14", "UA-09"]);

function headerValue(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value.trim();
  }
  return "";
}

function normalizeCountry(country: string) {
  return country.trim().toUpperCase();
}

function normalizeRegion(region: string) {
  return region.trim().toUpperCase();
}

export function geoblockFromHeaders(headers: Headers): GeoblockResult | null {
  const country = normalizeCountry(
    headerValue(headers, [
      "x-vercel-ip-country",
      "cf-ipcountry",
      "cloudfront-viewer-country",
      "x-country-code",
    ]),
  );
  const region = normalizeRegion(
    headerValue(headers, [
      "x-vercel-ip-country-region",
      "x-vercel-ip-region",
      "cf-region-code",
      "x-region-code",
    ]),
  );

  if (!country) return null;

  const regionKey = region ? `${country}-${region}` : "";
  const blocked = BLOCKED_COUNTRIES.has(country) || BLOCKED_REGIONS.has(regionKey);
  return {
    blocked,
    source: "headers",
    country,
    region: region || undefined,
    reason: blocked ? "Polymarket trading is not available in this region." : undefined,
  };
}

export async function checkPolymarketGeoblock(headers?: Headers): Promise<GeoblockResult> {
  const headerResult = headers ? geoblockFromHeaders(headers) : null;
  if (headerResult) return headerResult;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch("https://polymarket.com/api/geoblock", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Geoblock check failed with ${res.status}`);
    }
    const data = (await res.json()) as Partial<GeoblockResult>;
    return {
      blocked: data.blocked === true,
      source: "polymarket",
      country: typeof data.country === "string" ? data.country : undefined,
      region: typeof data.region === "string" ? data.region : undefined,
      ip: typeof data.ip === "string" ? data.ip : undefined,
      reason:
        data.blocked === true ? "Polymarket trading is not available in this region." : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
