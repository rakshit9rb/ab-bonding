# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Heads up: Next.js version

This repo uses Next.js 16.2.4 with the App Router. `AGENTS.md` flags that the API and conventions may differ from training data — when in doubt, read the upstream guide in `node_modules/next/dist/docs/` before writing route handlers, layouts, or rewrites. `next.config.ts` has `reactCompiler: true`, so React Compiler is doing memoization — avoid hand-rolled `useMemo`/`useCallback` "just in case."

## Commands

```bash
pnpm dev               # next dev (default port 3000)
pnpm build             # next build
pnpm start             # next start
pnpm lint              # oxlint . --quiet  (NOT eslint)
pnpm format            # oxlint --fix + oxfmt --write
pnpm knip              # dead code / unused export check
```

Linting and formatting are **oxlint + oxfmt** (Rust toolchain), not eslint/prettier. Husky runs lint-staged on commit. There is no test suite in this repo.

## What "bonds" means

A "bond" is a Polymarket binary market where one side trades at ≥ the threshold (default 95%, also 90/97/99 in the UI). The dashboard picks whichever outcome (YES or NO) is ≥ 0.5 and reports it as the "side," with the **annualized yield** computed as `((1 - p) / p) × (365 / daysToExpiry) × 100`. Markets with placeholder end dates (year ≥ 2030) get `apy = null` — they're not real maturities, just defaults.

## Architecture — the big picture

### Two-wallet model (critical)

Users connect via **Privy** (Google login or external wallet). Privy provisions/connects an EOA on Polygon (the "signer" or "connected wallet"). But Polymarket CLOB orders are _not_ placed from the EOA — they're placed from a **deterministic deposit wallet smart contract** derived from the EOA via `@polymarket/builder-relayer-client`'s `deriveDepositWallet(owner, FACTORY, IMPL)`.

Consequences that show up all over the trade flow:

- `signAndPlaceOrder` in `src/lib/polymarket.ts` constructs a `ClobClient` with `signatureType: SignatureTypeV2.POLY_1271` and `funderAddress: depositWalletAddress`. The EOA is the signer; the deposit wallet is the maker.
- The deposit wallet must be deployed before its first trade — handled via `POST /api/polymarket/deposit-wallet` (calls the Polymarket relayer `/submit` with `type: WALLET-CREATE`).
- Approvals (pUSD → exchange, and `setApprovalForAll` of conditional tokens) are done _by the deposit wallet_, batched as EIP-712-signed `Batch` calls (`DepositWallet` / `version: "1"` domain) and submitted via `POST /api/polymarket/deposit-wallet/batch`. The route allowlists only those two specific approval calldata shapes — see `isAllowedApprovalCall`.
- Funds must be moved from the connected EOA to the deposit wallet before trading. The UI shows two balances ("Connected" and "Trading") and a "Move pUSD" button that does a sponsored `transfer` via Privy gas sponsorship (`sendTransaction({ ... }, { sponsor: true, address })`).

### Collateral on Polygon

- **pUSD** (`0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB`) is Polymarket's collateral token. All CLOB orders settle in pUSD.
- **USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) is bridged USDC. The UI lets users wrap USDC.e → pUSD via the `COLLATERAL_ONRAMP` (`0x93070a847efEf7F70739046A929D47a521F5B8ee`) `wrap` function. Requires a prior ERC-20 approval of USDC.e → onramp.
- The two exchanges are `CTF_EXCHANGE` (`0xE111…996B`) and `NEG_RISK_CTF_EXCHANGE` (`0xe222…0F59`). Each market sets `negRisk: bool` and the code picks the right one.

### CLOB auth — two layers, secrets stay server-side

Polymarket CLOB needs L1 → L2 auth bootstrap:

1. **L1 (client)**: `src/lib/polymarketAuth.ts` asks the wallet to sign an EIP-712 `ClobAuth` message (chainId 137). The signed payload is POSTed to `/api/clob/auth`.
2. **Server (`src/lib/clobServerAuth.ts`)**: hits Polymarket's `/auth/api-key` (or `/auth/derive-api-key`) to obtain `{ apiKey, secret, passphrase }`, then encrypts the bundle (AES-256-GCM, key = sha256 of `POLYMARKET_CREDS_SECRET`) into the `__Host-clob_creds` httpOnly cookie. The browser never sees the secret.
3. **L2 (per request)**: every authed CLOB call goes through a Next route (`/api/clob/order`, `/api/clob/account`, `/api/clob/order-status`) which decrypts the cookie, builds `POLY_*` HMAC headers via `buildL2Headers`, and optionally adds builder headers via `buildBuilderHeaders` (using `POLY_BUILDER_*` env vars and `@polymarket/builder-signing-sdk`).

`fetchClobAuthed` in `src/lib/clobFetch.ts` is the helper that builds L2-signed requests on the server side.

### Order route validates owner ↔ signer ↔ maker

`POST /api/clob/order` (`src/app/api/clob/order/route.ts`) does _not_ just proxy. It re-derives the deposit wallet from `owner` and rejects anything where `(signatureType === 0 && owner === signer === maker)` or `(signatureType === 3 && depositWallet === signer === maker)` doesn't hold. It also rejects V1 order fields (`nonce`, `feeRateBps`, `taker`) and enforces the V2 shape (`timestamp` int, bytes32 `metadata`/`builder`). When editing trade flow code, expect those guards.

### Market data pipeline (`/api/markets`, `src/lib/bonds.ts`)

`fetchBonds(minProb)` runs **server-side only** (called from `app/page.tsx` and `/api/markets`):

1. Fan-out 3 Gamma keyset queries (`order = volume_num | liquidity_num | endDateIso`), 4 pages each, dedupe by `conditionId`.
2. Fallback to `/markets?closed=false&limit=200` if all keyset calls fail.
3. Filter: not closed/archived, price within `[minProb, 0.9995)`, real future `endDate`.
4. Batch-fetch parent event volumes (`/events/:id`) — sub-events (e.g. `…-more-markets` sports lines) inherit the parent's volume because individual binary lines have meaningless volume.
5. Batch-fetch CLOB `/books` (50 per request) and compute `liquidity` as USDC notional of asks within `LIQUIDITY_PRICE_TOLERANCE` (0.02) of the displayed price — the real "near-the-money buyable size."

Both `/api/markets` (in-memory `Map` keyed by `minProb`, TTL 60s) and the Next route segment cache (`revalidate = 60`) provide caching. Categories are inferred from `m.category`/tags first, then keyword-regex fallback in `CATEGORY_RULES` — if you're tweaking taxonomy, that's the table.

### Disputes route (`/api/disputes`)

Separate Gamma query with `uma_resolution_status=disputed`. Surfaces in the Dashboard's "Disputed" tab. Treats `2026-12-31` as a placeholder end date (not a real maturity).

### Routes summary

| Route                                  | Purpose                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| `/` (SSR)                              | Dashboard — calls `fetchBonds(0.95)` in `app/page.tsx`, revalidate 60s                 |
| `/portfolio` (client)                  | Positions + activity from `data-api.polymarket.com`, funds panel                       |
| `/api/markets`                         | Bonds list (cached 60s in-memory)                                                      |
| `/api/disputes`                        | UMA-disputed markets                                                                   |
| `/api/balance`                         | `eth_call` proxy: balanceOf / allowance / CTF approval. Uses dRPC Polygon endpoint.    |
| `/api/clob/auth`                       | L1 sig → encrypted L2 creds cookie                                                     |
| `/api/clob/order`                      | Validated V2 order proxy (signs L2 + builder headers)                                  |
| `/api/clob/order-status`               | Authed `/order/:id` + `/trades` lookup                                                 |
| `/api/clob/account`                    | balance-allowance + open orders aggregation, computes `available = balance − reserved` |
| `/api/polymarket/deposit-wallet`       | GET: derive + check deployed. POST: deploy via relayer.                                |
| `/api/polymarket/deposit-wallet/batch` | GET nonce; POST submit signed batch (only approval calls allowed)                      |
| `/api/metrics/trade`                   | Server-side PostHog capture (allowlisted event names only)                             |

### Frontend

Three top-level client components:

- `Dashboard.tsx` — bonds table, filters (threshold/time/category/liquidity), disputes view, navbar with auth dropdown that shows trading wallet balance/address
- `TradePanel.tsx` — opens inline under a `BondRow`; order book polled every 2s from `${CLOB_URL}/book`, market/limit form, handles network switch → cred bootstrap → approval batch → order placement, with deposit panel toggle
- `Portfolio.tsx` — positions table, activity table (paginated from `data-api.polymarket.com/activity`), funds panel for moving pUSD into the trading wallet

`Providers.tsx` wraps everything with `PrivyProvider` (Google + wallet login, embedded wallet created for users without one, locked to Polygon).

Theming: `data-theme` attribute on `<html>`, set server-side from the `theme` cookie in `layout.tsx`, toggled client-side via `src/lib/theme.ts`. CSS variables in `app/globals.css`.

### PostHog

Configured in `src/instrumentation-client.ts` (`person_profiles: "identified_only"`, autocapture off). Reverse-proxied via `next.config.ts` rewrites (`/ingest/*` → `eu.i.posthog.com`). Client uses `posthog-js`; server route `/api/metrics/trade` uses `posthog-node` to capture an allowlisted set of trade events. When adding new server events, extend the `events` Set in that route.

## Environment variables

Required (see `.env` — values gitignored):

- `NEXT_PUBLIC_PRIVY_APP_ID` — Privy auth
- `NEXT_PUBLIC_POLY_BUILDER_CODE` — bytes32 builder code applied to orders (defaults to zero bytes32 if invalid)
- `POLY_BUILDER_API_KEY`, `POLY_BUILDER_SECRET`, `POLY_BUILDER_PASSPHRASE` — server-only; used to sign Polymarket relayer + CLOB builder headers
- `NEXT_PUBLIC_POSTHOG_KEY` (+ optional `NEXT_PUBLIC_POSTHOG_HOST`)
- `POLYMARKET_CREDS_SECRET` (or `AUTH_SECRET` / `NEXTAUTH_SECRET`) — required in production for CLOB cred cookie encryption; falls back to a dev string otherwise
- Optional: `POLYMARKET_RELAYER_URL` (defaults to `https://relayer-v2.polymarket.com`)

## Conventions

- Path alias: `@/*` → `src/*`
- TypeScript strict mode is on
- Money: pUSD/USDC.e are 6-decimal — multiply UI numbers by `1_000_000` before passing to `bigint`
- Polymarket prices are 0–1 floats; display in ¢ by `× 100`
- Pinned markets are case-insensitive substring matches in `src/lib/constants.ts` (`PINNED_MARKETS`)
- Admin-curated dashboard layout — keep the constants thin
