import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OnlyBonds — Polymarket High-Probability Markets',
  description: 'Track near-certain Polymarket prediction markets with APY calculations',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
