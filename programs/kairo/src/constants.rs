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

/// Emission halving interval, in seconds (= 482.8925 days).
/// Calibrated so day-1 emission ≈ 30,000 KAIRO and the cumulative curve's
/// asymptote equals `ASYMPTOTE_BASE`.
pub const H_SECONDS: u64 = 41_721_912;

/// One-time mining initialization fee, in lamports (0.1 SOL).
pub const INIT_FEE_LAMPORTS: u64 = 100_000_000;

// ---- PDA seeds ----
pub const GLOBAL_SEED: &[u8] = b"global";
pub const MINER_SEED: &[u8] = b"miner";
pub const MINT_AUTH_SEED: &[u8] = b"mint_auth";
pub const TREASURY_SEED: &[u8] = b"treasury";
