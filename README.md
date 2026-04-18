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

## PostHog metrics tracked

Current analytics events are focused on trading flow and execution quality.

### Trade lifecycle events

- `trade_panel_opened`
- `trade_preview_computed`
- `trade_submit_clicked`
- `trade_succeeded`
- `trade_failed`

### Approval and network friction events

- `network_switch_attempted`
- `network_switch_failed`
- `usdc_approval_started`
- `usdc_approval_succeeded`
- `usdc_approval_failed`

### Properties attached (where available)

- User/context: `user_id` (Privy id), `wallet_address`
- Market context: `bond_id`, `condition_id`, `market_slug`, `neg_risk`
- Trade context: `trade_dir`, `outcome`, `order_type`, `token_id`
- Volume/performance: `shares`, `avg_price`, `notional_usdc`, `price_impact`
- Result fields: `order_id` (success), `error_message` (failure)

### Notes

- Primary tracked trade path is `TradePanel`.
- Legacy `TradeModal` also emits core trade events (`trade_submit_clicked`, `trade_succeeded`, `trade_failed`).
- Some key events are also sent via server endpoint `/api/metrics/trade` for more reliable ingestion.
