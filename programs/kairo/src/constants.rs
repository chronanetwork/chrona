//! Protocol constants: token, emission curve, fees, and PDA seeds.

/// $KAIRO decimals.
pub const DECIMALS: u8 = 6;

/// Base units in one whole KAIRO (10^6).
pub const ONE_KAIRO: u64 = 1_000_000;

/// Total mineable supply, base units (21,000,000 cap − 100,000 premine).
/// The asymptote that program-minted supply approaches but never reaches.
pub const ASYMPTOTE_BASE: u64 = 20_900_000 * ONE_KAIRO;

/// Hard cap on total supply (premine + mined), base units.
pub const MAX_SUPPLY_BASE: u64 = 21_000_000 * ONE_KAIRO;

/// Premine / launch supply, base units (minted outside the program: DBC on
/// mainnet, direct mint on devnet).
pub const PREMINE_BASE: u64 = 100_000 * ONE_KAIRO;

// ---- Emission curve: sum of two halving curves (front-load + plateau) ----
//
// Cumulative E(t) = SPIKE·(1 − 2^(−t/H_spike)) + BASE·(1 − 2^(−t/H_base)).
// A sharp ~0.9-day "spike" front-loads day one, then a slow ~7.9-year "base"
// holds emission near 5,000 KAIRO/day for years before gently tapering. Result:
// day-1 = 30,000 KAIRO, dropping to ~5,000/day by day 10 and staying in the
// thousands for ~two decades. The two amounts sum exactly to ASYMPTOTE_BASE.

/// Front-load component total, base units (≈ 47,052 KAIRO).
pub const SPIKE_AMOUNT_BASE: u128 = 47_051_945_457;
/// Front-load half-life, seconds (≈ 0.914 days).
pub const SPIKE_H_SECONDS: u64 = 78_946;

/// Plateau/base component total, base units (≈ 20,852,948 KAIRO).
pub const BASE_AMOUNT_BASE: u128 = 20_852_948_054_543;
/// Base half-life, seconds (2,900 days ≈ 7.94 years).
pub const BASE_H_SECONDS: u64 = 250_560_000;

/// One-time mining initialization fee, in lamports (0.1 SOL).
pub const INIT_FEE_LAMPORTS: u64 = 100_000_000;

/// Default hash-rate (score) bounds, matching the scoring spec (`MIN_HR`/`MAX_HR`).
/// A fresh wallet floors at `MIN_SCORE`; the best wallets cap at `MAX_SCORE`.
pub const MIN_SCORE: u64 = 100;
pub const MAX_SCORE: u64 = 10_000;

// ---- PDA seeds ----
pub const GLOBAL_SEED: &[u8] = b"global";
pub const MINER_SEED: &[u8] = b"miner";
pub const MINT_AUTH_SEED: &[u8] = b"mint_auth";
