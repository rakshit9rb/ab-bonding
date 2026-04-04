import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { cookies } from "next/headers";
import { THEME_COOKIE_NAME, isTheme } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "OnlyBonds — Polymarket High-Probability Markets Dashboard",
    template: "%s | OnlyBonds",
  },
  description:
    "Track near-certain Polymarket prediction markets with annualized yield calculations. Find high-probability bonds, compare APY, and discover the best opportunities on Polymarket.",
  keywords: [
    "Polymarket",
    "prediction markets",
    "high probability",
    "APY",
    "bonds",
    "crypto",
    "trading",
    "yield",
    "market dashboard",
    "polymarket dashboard",
  ],
  authors: [{ name: "OnlyBonds" }],
  creator: "OnlyBonds",
  publisher: "OnlyBonds",
  applicationName: "OnlyBonds",
  referrer: "origin-when-cross-origin",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "OnlyBonds",
    title: "OnlyBonds — Polymarket High-Probability Markets Dashboard",
    description:
      "Track near-certain Polymarket prediction markets with annualized yield calculations. Find high-probability bonds and discover the best opportunities.",
    url: "https://onlybonds.fun",
    images: [
      {
        url: "https://onlybonds.fun/opengraph.png",
        width: 1200,
        height: 630,
        alt: "OnlyBonds — Polymarket High-Probability Markets Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OnlyBonds — Polymarket High-Probability Markets Dashboard",
    description:
      "Track near-certain Polymarket prediction markets with annualized yield calculations. Find high-probability bonds and discover the best opportunities.",
    images: ["https://onlybonds.fun/opengraph.png"],
    creator: "@ybhrdwj",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = isTheme(themeCookie) ? themeCookie : undefined;

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      data-theme={theme}
      suppressHydrationWarning
    >
      <body className="font-sans">{children}</body>
    </html>
  );
}
