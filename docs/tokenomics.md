# Tokenomics

Kairo's emission is a continuous halving curve — Bitcoin's shape, recalibrated so the first day is lively and the tail lasts effectively forever.

## Parameters

| Parameter | Value |
|---|---|
| Decimals | 9 |
| Genesis / launch supply (premine) | 100,000 KAIRO |
| Hard cap (asymptote) | 21,000,000 KAIRO |
| Mineable total | 20,900,000 KAIRO |
| Initial emission rate `r0` | 30,000 KAIRO / day |
| Halving interval `H` | ≈ 482.8925 days (~15.9 months) |

## The curve

Emission rate at time `t` (seconds since genesis):

```
r(t) = r0 · 2^(−t/H)
```

Cumulative emission to the whole network by time `t`:

```
E(t) = (r0 · H / ln 2) · (1 − 2^(−t/H))
```

As `t → ∞`, `E(t) → r0·H/ln2`. We choose `H` so that this asymptote equals the mineable total:

```
r0 · H / ln 2 = 20,900,000
H = 20,900,000 · ln 2 / 30,000  (per day)  ≈ 482.8925 days
```

So the curve is pinned by two facts the project wanted: **30,000 KAIRO on day one**, and a **21,000,000 hard cap** (100k premine + 20.9M mined) that is approached but never reached.

## Sanity checks

| Horizon | Cumulative mined | Still mineable |
|---|---|---|
| Day 1 | ≈ 29,978 KAIRO | yes |
| Year 1 | ≈ 8.52M | yes |
| Year 2 | ≈ 13.57M | yes |
| Year 5 | ≈ 19.38M | yes |
| Year 10 | ≈ 20.79M | yes (≈110k left and counting) |

## On-chain representation

All amounts are in base units (1 KAIRO = 1e9 base units). Time is `Clock.unix_timestamp` (seconds).

```
ASYMPTOTE_BASE = 20_900_000 * 1e9   // mineable cap, program-minted
H_SECONDS      = 41_721_915         // 482.8925 days
PREMINE_BASE   = 100_000   * 1e9    // minted outside the program (DBC / devnet)
```

The program never loops over blocks. The reward injected into the mining pool between two timestamps is the **closed-form difference** `ΔE = E(t_now) − E(t_last)`, which is exact across any number of halvings. `ΔE` is always floored to base units and clamped so cumulative program-minted supply can never exceed `ASYMPTOTE_BASE`. See [scoring-spec.md](scoring-spec.md) for hash rate and [architecture.md](architecture.md) for the accumulator.

## Launch & supply

- **Mainnet:** the 100k premine is created by a Dynamic Bonding Curve (DBC) launch using Kairo's chosen mint address. The DBC must leave mint authority with the deployer so it can subsequently be handed to the program (see architecture).
- **Devnet:** 100k is minted directly to the deployer; no DBC.

After launch, mint authority is transferred to a program PDA — from then on, the only new KAIRO that can ever exist is mined.
