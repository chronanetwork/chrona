# Tokenomics

Kairo's emission is the **sum of two halving curves**: a sharp front-load *spike* that makes the first days big, plus a 1-year *base* that rides down from ~50,000 KAIRO/day. Rewards drop fast at the start (rewarding the earliest miners) and then taper toward the cap over a handful of years.

## Parameters

| Parameter | Value |
|---|---|
| Decimals | 6 |
| Genesis / launch supply (premine) | 1,000,000 KAIRO |
| Hard cap | 21,000,000 KAIRO |
| Mineable total (asymptote) | 20,000,000 KAIRO |
| Day-1 emission | 300,000 KAIRO |
| Spike component | ≈ 957,239 KAIRO total, half-life ≈ 2.15 days |
| Base component | ≈ 19,042,761 KAIRO total, half-life = 365 days |

## The curve

```
E(t) = SPIKE·(1 − 2^(−t/H_spike)) + BASE·(1 − 2^(−t/H_base)),   clamped at 20,000,000
```

The two component totals sum **exactly** to the 20,000,000 mineable cap. The spike (≈ 2.15-day half-life) front-loads the first ~10 days; from then on emission rides the base curve down from ~50,000 KAIRO/day, halving each year. Combined with the 1M premine this approaches — but never quite reaches — the **21,000,000 hard cap**, enforced on-chain.

## Sanity checks

| Horizon | Emitted that day | Cumulative mined |
|---|---|---|
| Day 1 | 300,000 | 300,000 |
| Day 2 | ≈ 227,193 | ≈ 527,193 |
| Day 3 | ≈ 174,437 | ≈ 701,630 |
| Day 10 | ≈ 50,000 | ≈ 1.28M |
| Year 1 | ≈ 18,100 | ≈ 10.48M (52%) |
| Year 2 | ≈ 9,050 | ≈ 15.24M (76%) |
| Year 3 | ≈ 4,525 | ≈ 17.62M (88%) |
| Year 5 | ≈ 1,130 | ≈ 19.40M (97%) |

## On-chain representation

All amounts are in base units (1 KAIRO = 1e6 base units). Time is `Clock.unix_timestamp` (seconds).

```
ASYMPTOTE_BASE     = 20_000_000 * 1e6     // mineable cap (= SPIKE + BASE)
SPIKE_AMOUNT_BASE  = 957_238_647_208      // front-load total
SPIKE_H_SECONDS    = 185_703              // ≈ 2.15 days
BASE_AMOUNT_BASE   = 19_042_761_352_792   // base total
BASE_H_SECONDS     = 31_536_000           // 365 days
PREMINE_BASE       = 1_000_000 * 1e6      // minted outside the program (DBC / devnet)
```

The program never loops over blocks. The reward injected into the pool between two timestamps is the **closed-form difference** `ΔE = E(t_now) − E(t_last)`, floored to base units and clamped so program-minted supply can never exceed `ASYMPTOTE_BASE`. Each `2^(−t/H)` term uses an exact fixed-point binary-digit table, validated to **≤1 base-unit error** against a 60-digit reference. See [scoring-spec.md](scoring-spec.md) for hash rate and [architecture.md](architecture.md) for the accumulator.

## Launch & supply

- **Mainnet:** the 1,000,000 premine is created by a Dynamic Bonding Curve (DBC) launch using Kairo's chosen mint address. The DBC must leave mint authority with the deployer so it can subsequently be handed to the program (see architecture).
- **Devnet:** the premine is minted directly to the deployer; no DBC.

After launch, mint authority is transferred to a program PDA — from then on, the only new KAIRO that can ever exist is mined.

## Buyback & burn flywheel

Mining is fee-funded: 0.1 SOL to initialize a miner and 0.02 SOL per hashrate top-off. Those fees accumulate in the treasury, and a scheduled keeper recycles them into deflation:

- Every cycle (default 5 min) it reads the treasury SOL balance.
- A fixed **reserve** (default 10 SOL) is always retained for operations and fees.
- Of the **excess** above the trigger (default 11 SOL), **half** is sent to the operations wallet and **half** buys $KAIRO on the open market via Jupiter (`ExactIn`, slippage-bounded).
- The $KAIRO bought in that swap is **burned immediately** (SPL `Burn`), permanently removing it from supply.

The result is a flywheel: **network usage → fees → buybacks → burns → tighter supply**. Mining 20M new $KAIRO into circulation is offset over time by burns funded entirely by demand to mine. Every buyback and burn is an on-chain transaction; cumulative SOL spent and $KAIRO destroyed are tracked live (scorer `GET /buyback`, surfaced on the home page).

Operationally the keeper holds a hot key. Because the mint authority already lives in the program PDA (not this key), a compromise can never mint $KAIRO; the blast radius is limited to treasury SOL. The hard cap (21M) and burns are both enforced on-chain regardless.
