//! Protocol constants: token, emission curve, fees, and PDA seeds.

/// $KAIRO decimals.
pub const DECIMALS: u8 = 6;

/// Base units in one whole KAIRO (10^6).
pub const ONE_KAIRO: u64 = 1_000_000;

/// Total mineable supply, base units (21,000,000 cap − 1,000,000 premine).
/// The asymptote that program-minted supply approaches but never reaches.
pub const ASYMPTOTE_BASE: u64 = 20_000_000 * ONE_KAIRO;

/// Hard cap on total supply (premine + mined), base units.
pub const MAX_SUPPLY_BASE: u64 = 21_000_000 * ONE_KAIRO;

/// Premine / launch supply, base units (minted outside the program: DBC on
/// mainnet, direct mint on devnet).
pub const PREMINE_BASE: u64 = 1_000_000 * ONE_KAIRO;

// ---- Emission curve: sum of two halving curves (front-load + plateau) ----
//
// Cumulative E(t) = SPIKE·(1 − 2^(−t/H_spike)) + BASE·(1 − 2^(−t/H_base)).
// A sharp ~2.1-day "spike" front-loads the first days, then a 1-year "base"
// rides down from ~50,000 KAIRO/day. Result: day-1 = 300,000 KAIRO, easing to
// ~50,000/day by day 10 (300k→227k→174k→…→50k), ~97% mined by year 5. The two
// amounts sum exactly to ASYMPTOTE_BASE.

/// Front-load component total, base units (≈ 957,239 KAIRO).
pub const SPIKE_AMOUNT_BASE: u128 = 957_238_647_208;
/// Front-load half-life, seconds (≈ 2.149 days).
pub const SPIKE_H_SECONDS: u64 = 185_703;

/// Plateau/base component total, base units (≈ 19,042,761 KAIRO).
pub const BASE_AMOUNT_BASE: u128 = 19_042_761_352_792;
/// Base half-life, seconds (365 days).
pub const BASE_H_SECONDS: u64 = 31_536_000;

/// One-time mining initialization fee, in lamports (0.1 SOL).
pub const INIT_FEE_LAMPORTS: u64 = 100_000_000;

/// Top-off fee to restore hashrate to full, in lamports (0.02 SOL).
pub const TOPOFF_FEE_LAMPORTS: u64 = 20_000_000;

/// Hashrate half-life, in seconds (36 hours). Effective hashrate is
/// `base >> floor((now - last_topup) / HALFLIFE)` — it halves every 36h until
/// the miner tops off.
pub const HASHRATE_HALFLIFE_SECONDS: i64 = 36 * 3600;

/// Default hash-rate (score) bounds, matching the scoring spec (`MIN_HR`/`MAX_HR`).
/// A fresh wallet floors at `MIN_SCORE`; the best wallets cap at `MAX_SCORE`.
pub const MIN_SCORE: u64 = 100;
pub const MAX_SCORE: u64 = 10_000;

// ---- PDA seeds ----
// global/miner bumped to v2 with the decaying-hashrate account layout.
pub const GLOBAL_SEED: &[u8] = b"global-v2";
pub const MINER_SEED: &[u8] = b"miner-v2";
pub const MINT_AUTH_SEED: &[u8] = b"mint_auth";
