# Portfolio inline trade panel — design

**Date:** 2026-06-01
**Status:** Approved (pending spec review)

## Goal

On `/portfolio`, let a user open a market's trade section directly from one of
their positions — the same inline `TradePanel` the dashboard shows when you
click "Trade" on a `BondRow`.

## Behavior

- Clicking an **open** position row (the title text or anywhere else on the row)
  expands the existing `TradePanel` inline directly beneath that row, mirroring
  `BondRow`. Clicking the row again, or the panel's `×`, collapses it. Only one
  row is open at a time.
- A small **↗ icon** next to the market title is the only Polymarket link. It
  opens the event in a new tab and does **not** toggle the panel
  (`stopPropagation`). The title text itself no longer navigates.
- The panel opens pre-selected to the **outcome the user holds** with the
  **SELL** direction active. The user can still switch outcome/direction.
- **Redeemable (resolved) rows do not expand** — the market is closed, so there
  is nothing to trade. These rows keep their dimmed styling and only the ↗ icon
  is interactive.

## Data mapping — no new network calls

The Polymarket positions API (`data-api.polymarket.com/positions`) already
returns every field `TradePanel` needs (verified against the live response).
`Position → Bond`:

| Bond field           | Source from position                                                   |
| -------------------- | ---------------------------------------------------------------------- |
| `clobTokenIds`       | `outcomeIndex === 0 ? [asset, oppositeAsset] : [oppositeAsset, asset]` |
| `negRisk`            | `negativeRisk`                                                         |
| `outcome`            | `outcomeIndex === 0 ? "YES" : "NO"` (the held side)                    |
| `price`              | `curPrice` (order-book-load fallback only)                             |
| `id` / `conditionId` | `conditionId`                                                          |
| `slug`               | `eventSlug ?? slug`                                                    |
| `question`           | `title`                                                                |
| `endDate`            | `endDate`                                                              |
| `apy`                | `calcAPY(price, endDate)`                                              |
| `category`           | `""`                                                                   |
| `volume`/`liquidity` | `0` → TradePanel footer renders "—" (positions API omits them)         |

`clobTokenIds` must be `[yesTokenId, noTokenId]`. Because `outcomeIndex` tells us
which index the held `asset` is, the opposite token is `oppositeAsset`. If
`oppositeAsset` is missing (non-binary / malformed), fall back to duplicating the
held token so the held side still works.

## Code changes (scoped to two files)

### `src/components/Portfolio.tsx`

- Extend the `Position` interface with `outcomeIndex: number`,
  `oppositeAsset: string`, `negativeRisk: boolean`.
- Add a `positionToBond(p: Position): Bond` helper (imports `Bond` + `calcAPY`
  from `@/lib/bonds`).
- `PositionsTable`:
  - Add `openAsset: string | null` state; helper `isOpen(p)` /
    `toggle(p)` (no-op for redeemable rows).
  - Make each non-redeemable `<tr>` clickable: pointer cursor, hover highlight,
    `onClick` toggles. Drop the open row's bottom border (like `BondRow`).
  - Replace the title `<a>` with: title text (part of the row toggle) + a small
    `↗` anchor that links to `polymarket.com/event/{eventSlug}?via=onlybonds`
    and calls `stopPropagation`.
  - Render the expansion as a sibling row when open:
    `<tr><td colSpan={8} style={{ padding: 0 }}><TradePanel bond={positionToBond(p)} initialDir="SELL" onClose={() => setOpenAsset(null)} /></td></tr>`.

### `src/components/TradePanel.tsx`

- Add an optional prop `initialDir?: TradeDir` (default `"BUY"`); seed the
  `tradeDir` state from it. The dashboard's `BondRow` passes nothing, so its
  behavior is unchanged.

## Non-goals

- No volume/liquidity figures for the position's market (shows "—").
- No new API route or other server changes.
- No bulk/redeem actions — purely opening the existing trade UI.

## Verification

- `pnpm lint` and `pnpm build` pass.
- Manual on `/portfolio`: clicking an open position expands the panel with the
  held outcome + SELL pre-selected and a live streaming order book; the ↗ icon
  opens Polymarket without toggling; clicking the row again collapses it;
  redeemable rows do not expand; the dashboard `BondRow` trade flow is unchanged.
