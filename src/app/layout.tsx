import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: {
    default: "OnlyBonds — Polymarket High-Probability Markets Dashboard",
    template: "%s | OnlyBonds"
  },
  description: "Track near-certain Polymarket prediction markets with annualized yield calculations. Find high-probability bonds, compare APY, and discover the best opportunities on Polymarket.",
  keywords: ["Polymarket", "prediction markets", "high probability", "APY", "bonds", "crypto", "trading", "yield", "market dashboard", "polymarket dashboard"],
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
    description: "Track near-certain Polymarket prediction markets with annualized yield calculations. Find high-probability bonds and discover the best opportunities.",
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
    description: "Track near-certain Polymarket prediction markets with annualized yield calculations. Find high-probability bonds and discover the best opportunities.",
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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var d=document.documentElement,t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))d.classList.add('dark')}catch(e){}})()` }} />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-698PE3G7Q1" />
        <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-698PE3G7Q1');` }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  )
}
