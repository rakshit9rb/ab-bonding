import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { BuilderSigner } from "@polymarket/builder-signing-sdk";

export const CLOB_URL = "https://clob.polymarket.com";
const CLOB_CREDS_COOKIE = "__Host-clob_creds";
const CLOB_CREDS_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const CLOB_CREDS_COOKIE_VERSION = "v1";

export interface ApiCredentials {
  apiKey: string;
  secret: string;
  passphrase: string;
  address: string;
}

function decodeSecret(secret: string): Buffer {
  return Buffer.from(
    secret
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .replace(/[^A-Za-z0-9+/=]/g, ""),
    "base64",
  );
}

function normalizeAddress(address: unknown): string | null {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  return address.toLowerCase();
}

function getCookieSecret() {
  const secret =
    process.env.POLYMARKET_CREDS_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return "onlybonds-dev-clob-creds-secret";
    throw new Error("POLYMARKET_CREDS_SECRET is required to store CLOB credentials");
  }
  return secret;
}

function encryptionKey() {
  return createHash("sha256").update(getCookieSecret()).digest();
}

function encodeBase64Url(input: Buffer) {
  return input.toString("base64url");
}

function decodeBase64Url(input: string) {
  return Buffer.from(input, "base64url");
}

function encryptCreds(creds: ApiCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(creds.address));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(creds), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CLOB_CREDS_COOKIE_VERSION,
    encodeBase64Url(iv),
    encodeBase64Url(tag),
    encodeBase64Url(ciphertext),
  ].join(".");
}

function decryptCreds(value: string, address: string): ApiCredentials | null {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== CLOB_CREDS_COOKIE_VERSION || !iv || !tag || !ciphertext) return null;

  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), decodeBase64Url(iv));
    decipher.setAAD(Buffer.from(address));
    decipher.setAuthTag(decodeBase64Url(tag));
    const plaintext = Buffer.concat([
      decipher.update(decodeBase64Url(ciphertext)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<ApiCredentials>;
    if (
      parsed.address !== address ||
      typeof parsed.apiKey !== "string" ||
      typeof parsed.secret !== "string" ||
      typeof parsed.passphrase !== "string"
    ) {
      return null;
    }
    return {
      address,
      apiKey: parsed.apiKey,
      secret: parsed.secret,
      passphrase: parsed.passphrase,
    };
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return rawValue.join("=");
  }
  return "";
}

export function getClobCreds(request: Request, address: unknown): ApiCredentials | null {
  const normalized = normalizeAddress(address);
  if (!normalized) return null;
  const value = readCookie(request, CLOB_CREDS_COOKIE);
  return value ? decryptCreds(value, normalized) : null;
}

export function setClobCredsCookie(response: NextResponse, creds: ApiCredentials) {
  response.cookies.set(CLOB_CREDS_COOKIE, encryptCreds(creds), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CLOB_CREDS_COOKIE_MAX_AGE,
  });
}

export function clearClobCredsCookie(response: NextResponse) {
  response.cookies.set(CLOB_CREDS_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
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

  const headers = {
    "Content-Type": "application/json",
    POLY_ADDRESS: normalized,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: nonce,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${CLOB_URL}/auth/api-key`, {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      res = await fetch(`${CLOB_URL}/auth/derive-api-key`, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) return null;

  const data = await res.json();
  const creds = {
    apiKey: data.apiKey ?? data.api_key,
    secret: data.secret,
    passphrase: data.passphrase,
    address: normalized,
  };
  if (!creds.apiKey || !creds.secret || !creds.passphrase) return null;
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

export function buildBuilderHeaders(
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const key = process.env.POLY_BUILDER_API_KEY;
  const secret = process.env.POLY_BUILDER_SECRET;
  const passphrase = process.env.POLY_BUILDER_PASSPHRASE;
  if (!key || !secret || !passphrase) return {};

  const signer = new BuilderSigner({ key, secret, passphrase });
  return signer.createBuilderHeaderPayload(method.toUpperCase(), path, body);
}
