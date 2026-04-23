"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { polygon } from "viem/chains";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["google", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#059650",
          logo: "https://onlybonds.fun/dark.svg",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
        defaultChain: polygon,
        supportedChains: [polygon],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
