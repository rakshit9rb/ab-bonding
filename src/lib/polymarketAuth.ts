// Polymarket CLOB L1 authentication bootstrap.
// L2 API secrets stay server-side; the browser only asks the wallet to sign L1 auth.

const CLOB_URL = "https://clob.polymarket.com";

export interface ApiCredentials {
  address: string;
}

export function clearCreds(address: string) {
  void fetch("/api/clob/auth", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
}

// L1: sign EIP-712 ClobAuth message to create API key
async function createApiKey(walletClient: any, address: string): Promise<ApiCredentials | null> {
  try {
    const nonceRes = await fetch(`${CLOB_URL}/auth/nonce`);
    if (!nonceRes.ok) return null;
    const { nonce } = await nonceRes.json();
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const signature = await walletClient.signTypedData({
      account: address as `0x${string}`,
      domain: { name: "ClobAuthDomain", version: "1", chainId: 137 },
      types: {
        ClobAuth: [
          { name: "address", type: "address" },
          { name: "timestamp", type: "string" },
          { name: "nonce", type: "uint256" },
          { name: "message", type: "string" },
        ],
      },
      primaryType: "ClobAuth",
      message: {
        address: address as `0x${string}`,
        timestamp,
        nonce: BigInt(nonce),
        message: "This message attests that I control the given wallet",
      },
    });

    const res = await fetch("/api/clob/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ address, signature, timestamp, nonce: nonce.toString() }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("createApiKey failed", res.status, err);
      return null;
    }
    return { address };
  } catch (e) {
    console.error("createApiKey error", e);
    return null;
  }
}

export async function getOrCreateCreds(
  walletClient: any,
  address: string,
): Promise<ApiCredentials | null> {
  return createApiKey(walletClient, address);
}
