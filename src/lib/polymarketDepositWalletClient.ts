export interface DepositWalletInfo {
  address: string;
  deployed: boolean;
}

export interface DepositWalletCall {
  target: string;
  value: string;
  data: string;
}

export async function fetchDepositWalletInfo(owner: string) {
  const params = new URLSearchParams({ owner });
  const res = await fetch(`/api/polymarket/deposit-wallet?${params.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not resolve deposit wallet");
  return data as DepositWalletInfo;
}

export async function requestDepositWalletDeploy(owner: string) {
  const res = await fetch("/api/polymarket/deposit-wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not deploy deposit wallet");
  return data as DepositWalletInfo;
}

export async function fetchDepositWalletNonce(owner: string) {
  const params = new URLSearchParams({ owner });
  const res = await fetch(`/api/polymarket/deposit-wallet/batch?${params.toString()}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not fetch deposit wallet nonce");
  if (typeof data?.nonce !== "string") throw new Error("Relayer did not return a nonce");
  return data.nonce as string;
}

export async function submitSignedDepositWalletBatch({
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
  const res = await fetch("/api/polymarket/deposit-wallet/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, depositWallet, nonce, deadline, signature, calls }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "Could not submit deposit wallet batch");
  return data;
}
