import type { ConnectedWallet } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { polygon } from "viem/chains";

export const POLYGON_CHAIN_ID = polygon.id;

export function getPrimaryWallet(wallets: ConnectedWallet[]): ConnectedWallet | null {
  return (
    wallets.find(
      (wallet) => wallet.walletClientType === "privy" || wallet.connectorType === "embedded",
    ) ??
    wallets.find((wallet) => wallet.linked) ??
    wallets[0] ??
    null
  );
}

export function parseWalletChainId(chainId: string | null | undefined): number | null {
  if (!chainId) return null;
  if (chainId.startsWith("eip155:")) return Number(chainId.slice("eip155:".length));
  if (chainId.startsWith("0x")) return Number.parseInt(chainId, 16);
  return Number(chainId);
}

export async function ensureWalletOnPolygon(wallet: ConnectedWallet) {
  await wallet.switchChain(POLYGON_CHAIN_ID);
  const provider = await wallet.getEthereumProvider();
  const chainId = await provider.request({ method: "eth_chainId" });
  if (parseWalletChainId(String(chainId)) !== POLYGON_CHAIN_ID) {
    throw new Error("Wallet must be on Polygon to trade");
  }

  const walletClient = createWalletClient({
    account: wallet.address as `0x${string}`,
    chain: polygon,
    transport: custom(provider),
  });

  return { provider, walletClient };
}
