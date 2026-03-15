# ab-bonding

Polymarket high-probability bonds dashboard. Shows markets with YES probability ≥ 95%, with APY calculations.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- **`/api/markets`** — Next.js API route that fetches from Polymarket's Gamma API server-side (no CORS issues)
- **APY formula** — `((1 - price) / price) × (365 / daysToExpiry) × 100`
- **Auto-refresh** — every 60 seconds

## Filters

| Filter | Options |
|--------|---------|
| Expires | All · ≤24h · Today · This Week · This Month |
| Category | Dynamic from API |
| Sort | APY · Probability · Expiry · Volume |

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

One command, zero config needed.
