# One-click batch buy across multiple markets — feasibility & plan

## Context

Today buying a bond is per-market: `TradePanel` opens under one `BondRow`, and each purchase
calls `signAndPlaceOrder` (`src/lib/polymarket.ts:377`), which signs **one** CLOB order and
POSTs it to `/api/clob/order`. Goal: select N bonds and buy them all with a **single click**.

## Short answer

**Mostly yes — with one framing fix and one wallet-dependent caveat.**

Framing fix: Polymarket CLOB orders are **off-chain EIP-712 signed orders**, not on-chain
transactions. The operator matches/settles each order off-chain. So there is no single
on-chain "txn" that buys across N markets — the real goal is **one click / one signing
action**.

| Wallet type                         | True one-click for N markets?                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| **Privy embedded** (Google login)   | **Yes** — sign N orders silently in a loop on one click, submit all at once.                  |
| **External wallet** (MetaMask etc.) | **No** — each order is a separate EIP-712 signature popup the dApp can't suppress → N popups. |

### Why N signatures, not 1

The CLOB protocol signs **each order independently** — every order object carries its own
`signature` field. There is no protocol-level "sign once for N orders." The SDK
(`@polymarket/clob-client-v2`) exposes `postOrders(args: PostOrdersArgs[], …)`, which POSTs an
**array of already-signed orders** to `POST /orders` in one HTTP call — but it does **not**
aggregate signatures. You still produce N signatures, then batch the _transport_.

So batching buys = N signatures + 1 network round-trip, never 1 signature + 1 round-trip.

### Why "one click" still works for embedded wallets

Privy embedded wallets hold the key in-app and can sign **without a confirmation modal**
(`embeddedWallets: { showWalletUIs: false }`, or per-call `uiOptions`). Today
`src/components/Providers.tsx` sets no such config, so embedded-wallet signing currently shows
Privy's default modal per signature. With silent signing enabled, one "Buy basket" click can
sign N orders in a loop with zero popups, then submit them together. External injected wallets
give no such control — every `eth_signTypedData_v4` is a user popup.

### The on-chain deposit-wallet batch does NOT solve this

The deposit wallet (`@polymarket/builder-relayer-client`) _can_ execute N arbitrary calls from
**one** EIP-712 `Batch` signature — that's how the one-time approval batch works
(`TradePanel.tsx`, `DEPOSIT_WALLET_BATCH_TYPES`). Tempting, but it can't place CLOB orders:
matching happens off-chain via the operator, so you can't "buy at market" by calling
`CTF_EXCHANGE` directly on-chain (you'd need the operator's matched counterparty orders, which
takers don't have). Dead end for buying shares.

### Already one-click and reusable

- **L1 auth** — one signature per session, cached in `__Host-clob_creds` cookie. Reused.
- **Approval batch** — already a single signature covering all markets/exchanges
  (`handleApprove` → `signDepositWalletBatch`). Reused unchanged.

The only multi-step part is order signing — that's where batching applies.

## Recommended implementation

Build a "basket buy": select N bonds + per-market amounts; one click signs all and submits
them in a single request. Reuse the existing auth/approval flow; add order-array batching.

### 1. New backend route — `POST /api/clob/orders`

Mirror `src/app/api/clob/order/route.ts` but accept `orders: [...]`. For **each** order run the
existing guards (owner↔signer↔maker per `signatureType`; reject V1 fields; enforce V2
`timestamp`/`metadata`/`builder` shape — lines 23–38). Build L2 + builder headers for path
`/orders` (the path differs from `/order`, and `buildL2Headers`/`buildBuilderHeaders` sign over
method+path+body, so the path must be `/orders`). Forward the array to `${CLOB_URL}/orders`
(the SDK's `POST_ORDERS` endpoint). Return the per-order result array so the UI can show which
legs filled. Keep secrets server-side — do **not** call SDK `postOrders` from the browser.

### 2. Frontend basket signer

Add `signAndPlaceOrders(legs[])` alongside `signAndPlaceOrder` in `src/lib/polymarket.ts`:
construct the `ClobClient` once (same `POLY_1271` + `funderAddress` config), loop
`createOrder`/`createMarketOrder` per leg (each carries its own `tickSize`/`negRisk`), collect
`orderToJsonV2(...)` bodies into an array, POST once to `/api/clob/orders`. Each leg's order
type (FOK market vs GTC limit) can differ — `PostOrdersArgs` carries `orderType` per order.

### 3. Silent signing for embedded wallets

Set `embeddedWallets.showWalletUIs: false` in `src/components/Providers.tsx` (or pass
`uiOptions` at sign time) so the loop doesn't pop a modal per order. For external wallets,
either (a) restrict basket buy to embedded wallets, or (b) sign sequentially with a progress
indicator and accept N popups. **Main product decision.**

### 4. Pre-flight: aggregate funding

The deposit wallet must hold pUSD ≥ the **sum** of all leg costs before signing. Reuse the
balance check pattern (`/api/clob/account` / `/api/balance`) but validate the total; surface a
single "Move pUSD" prompt for any shortfall.

### 5. UX surface

A basket panel (checkbox per bond + amount, running total, one "Buy all" button). Partial
failures are normal — render per-leg success/failure from the `/orders` response rather than a
single all-or-nothing result.

## Critical files

- `src/lib/polymarket.ts:377` — `signAndPlaceOrder` (template for `signAndPlaceOrders`)
- `src/app/api/clob/order/route.ts` — single-order proxy (template for `/orders` route)
- `src/lib/clobServerAuth.ts` — `buildL2Headers` / `buildBuilderHeaders` (path-aware)
- `src/components/Providers.tsx` — Privy config (silent-signing toggle)
- `src/components/TradePanel.tsx` — existing auth + approval-batch flow to reuse
- `node_modules/@polymarket/clob-client-v2` — `postOrders` / `POST_ORDERS` reference

## Verification (when implemented)

- Unit-check that `/api/clob/orders` rejects a mixed array where any leg fails the
  owner↔signer↔maker guard (security parity with `/order`).
- E2E on Polygon with a funded embedded wallet: select 2–3 small bonds, click once, confirm
  zero signing popups and that all legs appear in `/portfolio` positions.
- Confirm external-wallet path behaves per the chosen option (N popups or gated off).
- Confirm aggregate-funding pre-flight blocks an underfunded basket before any signing.

## Open decision

External-wallet handling — gate batch to embedded-only vs. allow N sequential popups. Shapes
the UI; decide before building.
