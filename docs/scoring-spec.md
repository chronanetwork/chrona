# Scoring specification

A wallet's **score** is its **hash rate**. This document is the normative spec: given the same public on-chain data, any implementation must produce the same score. Determinism is what makes the single-oracle model auditable — see [oracle-trust.md](oracle-trust.md).

## Inputs

All inputs are derived from a wallet's public mainnet history via Helius's
`getTransactionsForAddress` (one call with `sortOrder: asc, limit: 1` for the
oldest tx → age; bounded pages of full, token-account-aware transactions with
`tokenAccounts: "balanceChanged"` for trades/volume/hold). Swaps are detected
from real on-chain balance deltas, so every DEX is covered:

| Input | Meaning |
|---|---|
| `age_days` | Days since the wallet's earliest transaction. |
| `n_trades` | Count of **qualifying** swaps (notional ≥ `MIN_TRADE_USD`). |
| `usd_volume` | Sum of qualifying-swap notionals, in USD. |
| `median_hold_days` | Median holding period of tokens the wallet **bought** (not received). |

### What counts as a "trade"

A *qualifying swap* is an on-chain swap where the wallet paid a quote asset (SOL/USDC/USDT) and received another token, or vice-versa, **with notional ≥ `MIN_TRADE_USD`**. Dust and micro-swaps are ignored — this is the first line of Sybil/wash-trade defense.

### What counts as "bought"

For hold-time, a position only counts if the token was **acquired via a qualifying swap** (the wallet paid for it). Airdrops, and tokens merely transferred in, are excluded — so buying an aged wallet full of airdrop history yields no hold-time credit. Hold time is measured from acquisition to disposal (or to *now* for still-open positions), and we take the **median across distinct mints bought** so a single stale bag can't fake conviction.

## Parameters

| Constant | Value | Role |
|---|---|---|
| `MIN_TRADE_USD` | $10 | Minimum notional for a swap to count. |
| `AGE_CAP_DAYS` | 730 | Diminishing returns past ~2 years. |
| `TRADE_CAP` | 500 | Log saturation point for trade count. |
| `VOL_CAP` | $1,000,000 | Log saturation point for volume. |
| `HOLD_CAP_DAYS` | 90 | Hold time saturates at ~3 months. |
| `MIN_HR` | 100 | Floor hash rate (fresh wallet — low but nonzero). |
| `MAX_HR` | 10,000 | Ceiling hash rate (keeps the system fair). |

## Formula

Each sub-score is normalized to `[0, 1]`; trade and volume use `log1p` so gaming hits diminishing returns fast.

```
age_score   = clamp( log1p(age_days)   / log1p(AGE_CAP_DAYS), 0, 1 )
trade_score = clamp( log1p(n_trades)   / log1p(TRADE_CAP),    0, 1 )
vol_score   = clamp( log1p(usd_volume) / log1p(VOL_CAP),      0, 1 )
hold_score  = clamp( median_hold_days  / HOLD_CAP_DAYS,       0, 1 )

raw = 0.25*age_score + 0.20*trade_score + 0.30*vol_score + 0.25*hold_score

hash_rate = round( MIN_HR + raw * (MAX_HR - MIN_HR) )
```

**Weights:** age 25% · trades 20% · volume 30% · hold 25%.

A brand-new wallet scores `raw ≈ 0` → `hash_rate = MIN_HR = 100`. A maximally-active wallet approaches `hash_rate = 10,000` — a 100× spread, capped so no single wallet dominates the pool.

## Determinism rules

To guarantee byte-identical scores across runs and implementations:

1. Round all intermediate values to fixed precision (USD to cents, days to 6 decimals) before combining.
2. Pin the historical price source and rounding (documented in the scorer). Volume is computed at trade-time prices.
3. The final `hash_rate` is an integer (`round`, ties to even).

## Anti-gaming summary

- **`MIN_TRADE_USD` floor** kills count/volume padding via dust swaps.
- **`log1p` scaling** on trades & volume means wash trading buys vanishingly little extra score per dollar of fees burned.
- **Bought-only, median hold time** defeats airdrop-farm and aged-wallet purchases.
- **`MAX_HR` cap** bounds the payoff of any single wallet, so Sybil splitting (each costing 0.1 SOL + real activity) is never advantageous over one honest wallet.
- The 0.1 SOL initialization fee is the per-identity cost that makes Sybil farming uneconomical.

## Hash-rate lifecycle

A score is **snapshotted at initialization** and stays fixed. A miner may **voluntarily re-attest** later to refresh it (e.g. after more activity); there is no automatic decay in v1. Decay / mandatory re-attestation is a possible v2.
