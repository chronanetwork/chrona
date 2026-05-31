# Tokenomics

Kairo's emission is a **front-loaded power-law curve**: it pays out fast on day one and tapers quickly, rewarding the earliest miners, then settles into a centuries-long tail that approaches — but never reaches — the cap.

## Parameters

| Parameter | Value |
|---|---|
| Decimals | 6 |
| Genesis / launch supply (premine) | 100,000 KAIRO |
| Hard cap | 21,000,000 KAIRO |
| Mineable total (asymptote) | 20,900,000 KAIRO |
| Day-1 emission | 30,000 KAIRO |
| Exponent `p` | 0.55 (so `1 − p = 0.45`) |
| Scale `K` | ≈ 81,958.2 KAIRO |

## The curve

With `t_days = elapsed_secs / 86400 + 1`, the emission rate decays as a power law and the cumulative emission is:

```
r(t) ∝ t_days^(−p)
E(t) = K · (t_days^(1−p) − 1),   clamped at 20,900,000
```

`K` is pinned so that **day 1 emits exactly 30,000 KAIRO**. Because `1 − p > 0`, `E(t)` keeps growing, reaching the **20,900,000 mineable cap at ≈ 616 years** — at which point all that exists is the 100k premine plus 20.9M mined: the **21,000,000 hard cap**, enforced on-chain.

Unlike a halving curve (whose day-over-day drop is gentle), a power law falls steeply at the start — so the earliest miners genuinely earn the most.

## Sanity checks

| Horizon | Emitted that day | Cumulative mined |
|---|---|---|
| Day 1 | 30,000 | 30,000 |
| Day 2 | ≈ 22,410 | ≈ 52,410 |
| Day 3 | ≈ 18,571 | ≈ 70,981 |
| Day 5 | ≈ 14,458 | ≈ 101,594 |
| Year 1 | — | ≈ 1.085M |
| Year 10 | — | ≈ 3.20M |
| Year 100 | — | ≈ 9.18M |
| Year ~616 | — | 20,900,000 (cap) |

## On-chain representation

All amounts are in base units (1 KAIRO = 1e6 base units). Time is `Clock.unix_timestamp` (seconds).

```
ASYMPTOTE_BASE  = 20_900_000 * 1e6   // mineable cap, program-minted
EMISSION_K_BASE = 81_958_198_440     // K in base units
ONE_MINUS_P_Q64 = 0.45 in Q64.64     // exponent (1 − p)
PREMINE_BASE    = 100_000   * 1e6    // minted outside the program (DBC / devnet)
```

The program never loops over blocks. The reward injected into the pool between two timestamps is the **closed-form difference** `ΔE = E(t_now) − E(t_last)`, floored to base units and clamped so program-minted supply can never exceed `ASYMPTOTE_BASE`. The fractional power `t_days^(1−p)` is computed as `2^((1−p)·log2(t_days))` with exact fixed-point `log2` and `2^x`, validated to **0 base-unit error** against a 90-digit reference. See [scoring-spec.md](scoring-spec.md) for hash rate and [architecture.md](architecture.md) for the accumulator.

## Launch & supply

- **Mainnet:** the 100k premine is created by a Dynamic Bonding Curve (DBC) launch using Kairo's chosen mint address. The DBC must leave mint authority with the deployer so it can subsequently be handed to the program (see architecture).
- **Devnet:** 100k is minted directly to the deployer; no DBC.

After launch, mint authority is transferred to a program PDA — from then on, the only new KAIRO that can ever exist is mined.
