# Tokenomics

Kairo's emission is the **sum of two halving curves**: a sharp front-load *spike* that makes day one big, plus a slow *base* that holds emission near 5,000 KAIRO/day for years. So rewards drop fast at the start (rewarding the earliest miners) and then settle onto a long, gently-declining plateau.

## Parameters

| Parameter | Value |
|---|---|
| Decimals | 6 |
| Genesis / launch supply (premine) | 100,000 KAIRO |
| Hard cap | 21,000,000 KAIRO |
| Mineable total (asymptote) | 20,900,000 KAIRO |
| Day-1 emission | 30,000 KAIRO |
| Spike component | ≈ 47,052 KAIRO total, half-life ≈ 0.91 days |
| Base component | ≈ 20,852,948 KAIRO total, half-life ≈ 7.94 years |

## The curve

```
E(t) = SPIKE·(1 − 2^(−t/H_spike)) + BASE·(1 − 2^(−t/H_base)),   clamped at 20,900,000
```

The two component totals sum **exactly** to the 20,900,000 mineable cap. The spike (≈ 0.91-day half-life) is essentially spent within ~10 days; from then on emission rides the base curve at ≈ 5,000 KAIRO/day, halving only every ~7.94 years. Combined with the 100k premine this approaches — but never quite reaches — the **21,000,000 hard cap**, enforced on-chain.

## Sanity checks

| Horizon | Emitted that day | Cumulative mined |
|---|---|---|
| Day 1 | 30,000 | 30,000 |
| Day 2 | ≈ 16,698 | ≈ 46,698 |
| Day 3 | ≈ 10,468 | ≈ 57,166 |
| Day 5 | ≈ 6,182 | ≈ 70,898 |
| Day 10 | ≈ 5,000 | ≈ 96,810 |
| Year 1 | ≈ 4,568 | ≈ 1.79M |
| Year 5 | ≈ 3,223 | ≈ 7.42M |
| Year 10 | ≈ 2,083 | ≈ 12.18M |
| Year 50 | ≈ 64 | ≈ 20.63M (98.7%) |

## On-chain representation

All amounts are in base units (1 KAIRO = 1e6 base units). Time is `Clock.unix_timestamp` (seconds).

```
ASYMPTOTE_BASE     = 20_900_000 * 1e6     // mineable cap (= SPIKE + BASE)
SPIKE_AMOUNT_BASE  = 47_051_945_457       // front-load total
SPIKE_H_SECONDS    = 78_946               // ≈ 0.91 days
BASE_AMOUNT_BASE   = 20_852_948_054_543   // plateau total
BASE_H_SECONDS     = 250_560_000          // 2900 days ≈ 7.94 years
PREMINE_BASE       = 100_000   * 1e6      // minted outside the program (DBC / devnet)
```

The program never loops over blocks. The reward injected into the pool between two timestamps is the **closed-form difference** `ΔE = E(t_now) − E(t_last)`, floored to base units and clamped so program-minted supply can never exceed `ASYMPTOTE_BASE`. Each `2^(−t/H)` term uses an exact fixed-point binary-digit table, validated to **≤1 base-unit error** against a 60-digit reference. See [scoring-spec.md](scoring-spec.md) for hash rate and [architecture.md](architecture.md) for the accumulator.

## Launch & supply

- **Mainnet:** the 100k premine is created by a Dynamic Bonding Curve (DBC) launch using Kairo's chosen mint address. The DBC must leave mint authority with the deployer so it can subsequently be handed to the program (see architecture).
- **Devnet:** 100k is minted directly to the deployer; no DBC.

After launch, mint authority is transferred to a program PDA — from then on, the only new KAIRO that can ever exist is mined.
