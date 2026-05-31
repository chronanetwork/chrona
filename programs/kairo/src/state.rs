use anchor_lang::prelude::*;

/// Singleton program configuration and mining-pool state.
/// PDA: `["global"]`.
#[account]
#[derive(InitSpace)]
pub struct GlobalState {
    /// Admin: may rotate the oracle key, adjust params, pause, hand over mint authority.
    pub authority: Pubkey,
    /// Ed25519 public key the scorer oracle signs attestations with.
    pub oracle_pubkey: Pubkey,
    /// The $KAIRO mint this program controls.
    pub mint: Pubkey,
    /// Wallet that receives initialization fees.
    pub treasury: Pubkey,

    /// Unix timestamp at which mining became active (emission genesis). 0 until active.
    pub genesis_ts: i64,
    /// Last timestamp the accumulator was settled to.
    pub last_update_ts: i64,
    /// Accumulated reward per unit hash rate, Q64.64 fixed point (base units).
    pub acc_reward_per_hash: u128,
    /// Sum of active miners' hash rates.
    pub total_hash_rate: u64,
    /// Total base units the program has injected into the pool (mined only).
    pub total_minted_base: u64,
    /// Mint supply observed at the moment authority was handed to the program
    /// (the premine). Recorded for cap accounting / audit.
    pub premine_observed: u64,

    /// One-time initialization fee, lamports.
    pub init_fee_lamports: u64,
    /// Minimum acceptable score (hash rate).
    pub min_score: u64,
    /// Maximum acceptable score (hash rate).
    pub max_score: u64,
    /// How long an attestation is valid, seconds.
    pub attestation_validity_secs: i64,

    /// Whether mining is active (mint authority held by program).
    pub active: bool,
    /// Emergency pause for joins/claims.
    pub paused: bool,

    pub bump: u8,
    pub mint_auth_bump: u8,
}

/// Per-wallet mining account. PDA: `["miner", owner]`.
#[account]
#[derive(InitSpace)]
pub struct Miner {
    pub owner: Pubkey,
    /// This wallet's hash rate (= attested score snapshot).
    pub hash_rate: u64,
    /// `acc_reward_per_hash` checkpoint at last settle, Q64.64.
    pub reward_debt: u128,
    /// Settled-but-unclaimed rewards, base units.
    pub accrued_base: u64,
    /// When this miner joined.
    pub joined_ts: i64,
    /// Expiry of the attestation used at (re-)initialization.
    pub attestation_expiry: i64,
    /// Nonce from the most recent attestation (audit/replay reference).
    pub score_nonce: [u8; 32],
    pub bump: u8,
}
