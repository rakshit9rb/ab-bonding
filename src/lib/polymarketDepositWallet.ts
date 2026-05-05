import { deriveDepositWallet } from "@polymarket/builder-relayer-client";
import { buildBuilderHeaders } from "@/lib/clobServerAuth";

const RELAYER_URL = process.env.POLYMARKET_RELAYER_URL ?? "https://relayer-v2.polymarket.com";

const DEPOSIT_WALLET_FACTORY = "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07" as const;
const DEPOSIT_WALLET_IMPLEMENTATION = "0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB" as const;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function normalizeAddress(address: unknown) {
  if (typeof address !== "string" || !ADDRESS_RE.test(address)) return null;
  return address.toLowerCase();
}

export function derivePolymarketDepositWallet(owner: string) {
  return deriveDepositWallet(owner, DEPOSIT_WALLET_FACTORY, DEPOSIT_WALLET_IMPLEMENTATION);
}

export async function fetchDepositWalletDeployed(address: string) {
  const url = new URL(`${RELAYER_URL}/deployed`);
  url.searchParams.set("address", address);
  url.searchParams.set("type", "WALLET");
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not check deposit wallet deployment");
  return data?.deployed === true;
}

export async function submitDepositWalletDeploy(owner: string) {
  const body = JSON.stringify({
    type: "WALLET-CREATE",
    from: owner,
    to: DEPOSIT_WALLET_FACTORY,
  });
  const res = await fetch(`${RELAYER_URL}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildBuilderHeaders("POST", "/submit", body),
    },
    body,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not deploy deposit wallet");
  return data;
}

interface DepositWalletCall {
  target: string;
  value: string;
  data: string;
}

export async function fetchDepositWalletNonce(owner: string) {
  const url = new URL(`${RELAYER_URL}/nonce`);
  url.searchParams.set("address", owner);
  url.searchParams.set("type", "WALLET");
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not fetch deposit wallet nonce");
  const nonce = data?.nonce;
  if (nonce === undefined || nonce === null) throw new Error("Relayer did not return a nonce");
  return String(nonce);
}

export async function submitDepositWalletBatch({
  owner,
  depositWallet,
  nonce,
  deadline,
  signature,
  calls,
}: {
  owner: string;
  depositWallet: string;
  nonce: string;
  deadline: string;
  signature: string;
  calls: DepositWalletCall[];
}) {
  const body = JSON.stringify({
    type: "WALLET",
    from: owner,
    to: DEPOSIT_WALLET_FACTORY,
    nonce,
    signature,
    depositWalletParams: {
      depositWallet,
      deadline,
      calls,
    },
  });
  const res = await fetch(`${RELAYER_URL}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildBuilderHeaders("POST", "/submit", body),
    },
    body,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not submit deposit wallet batch");
  return data;
}
