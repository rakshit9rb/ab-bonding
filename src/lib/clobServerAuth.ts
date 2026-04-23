import { createHmac } from "crypto";

export const CLOB_URL = "https://clob.polymarket.com";

export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
  address: string;
}

const credsByAddress = new Map<string, ApiCredentials>();

function decodeSecret(secret: string): Buffer {
  return Buffer.from(
    secret.replaceAll("-", "+").replaceAll("_", "/").replace(/[^A-Za-z0-9+/=]/g, ""),
    "base64",
  );
}

function normalizeAddress(address: unknown): string | null {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return address.toLowerCase();
}

export function getClobCreds(address: unknown): ApiCredentials | null {
  const normalized = normalizeAddress(address);
  return normalized ? (credsByAddress.get(normalized) ?? null) : null;
}

export function clearClobCreds(address: unknown): boolean {
  const normalized = normalizeAddress(address);
  return normalized ? credsByAddress.delete(normalized) : false;
}

export async function createClobCreds({
  address,
  signature,
  timestamp,
  nonce,
}: {
  address: unknown;
  signature: unknown;
  timestamp: unknown;
  nonce: unknown;
}): Promise<ApiCredentials | null> {
  const normalized = normalizeAddress(address);
  if (
    !normalized ||
    typeof signature !== "string" ||
    typeof timestamp !== "string" ||
    typeof nonce !== "string"
  ) {
    return null;
  }

  const res = await fetch(`${CLOB_URL}/auth/api-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      POLY_ADDRESS: normalized,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp,
      POLY_NONCE: nonce,
    },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const creds = {
    apiKey: data.apiKey ?? data.api_key,
    secret: data.secret,
    passphrase: data.passphrase,
    address: normalized,
  };
  if (!creds.apiKey || !creds.secret || !creds.passphrase) return null;
  credsByAddress.set(normalized, creds);
  return creds;
}

export function buildL2Headers(
  creds: ApiCredentials,
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac("sha256", decodeSecret(creds.secret))
    .update(timestamp + method.toUpperCase() + path + body)
    .digest("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_");

  return {
    POLY_ADDRESS: creds.address,
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
    POLY_SIGNATURE: sig,
    POLY_TIMESTAMP: timestamp,
  };
}
