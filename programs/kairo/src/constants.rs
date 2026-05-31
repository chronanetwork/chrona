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

// ---- Emission curve: power law r(t) = C · t^(-p), front-loaded ----
//
// Cumulative emission E(t) = K · (t_days^(1-p) − 1), with t_days = elapsed/86400 + 1.
// p = 0.55 (so 1−p = 0.45). Calibrated so day-1 emission = 30,000 KAIRO; the
// curve drops fast early (30k → 22.4k → 18.6k → 16.2k … per day) then tails off
// slowly, approaching the 20.9M mineable cap at ≈ 616 years. Earliest miners
// earn the most; mining stays meaningful for centuries.

/// Seconds per day.
pub const SECONDS_PER_DAY: u64 = 86_400;

/// (1 − p) = 0.45 in Q64.64 fixed point.
pub const ONE_MINUS_P_Q64: u128 = 8_301_034_833_169_298_227;

/// Emission scale K in base units: K = C/(1−p), where C is set by day-1 = 30,000 KAIRO.
pub const EMISSION_K_BASE: u128 = 81_958_198_440;

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
