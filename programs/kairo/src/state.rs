use anchor_lang::prelude::*;

use crate::constants::ASYMPTOTE_BASE;
use crate::errors::KairoError;
use crate::math;

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
    /// Fee to restore hash rate to full, lamports.
    pub topoff_fee_lamports: u64,
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

impl GlobalState {
    /// Lazily advance the reward accumulator to `now_ts`, injecting the
    /// emission released since the last update and distributing it across the
    /// current total hash rate. Floors to base units and clamps at the mineable
    /// cap. Must be called at the start of every state-changing instruction,
    /// and always *before* `total_hash_rate` changes.
    pub fn update_pool(&mut self, now_ts: i64) -> Result<()> {
        if !self.active || now_ts <= self.last_update_ts {
            return Ok(());
        }
        if self.total_hash_rate > 0 {
            let last_elapsed = self.last_update_ts.saturating_sub(self.genesis_ts).max(0) as u64;
            let now_elapsed = now_ts.saturating_sub(self.genesis_ts).max(0) as u64;

            let mut d_e = math::emission_between(last_elapsed, now_elapsed);
            let remaining = ASYMPTOTE_BASE.saturating_sub(self.total_minted_base);
            if d_e > remaining {
                d_e = remaining;
            }
            if d_e > 0 {
                let inc = math::acc_increment(d_e, self.total_hash_rate);
                self.acc_reward_per_hash = self
                    .acc_reward_per_hash
                    .checked_add(inc)
                    .ok_or(KairoError::MathOverflow)?;
                self.total_minted_base = self
                    .total_minted_base
                    .checked_add(d_e)
                    .ok_or(KairoError::MathOverflow)?;
            }
        }
        self.last_update_ts = now_ts;
        Ok(())
    }
}

/// Per-wallet mining account. PDA: `["miner", owner]`.
#[account]
#[derive(InitSpace)]
pub struct Miner {
    pub owner: Pubkey,
    /// Full (attested) hash rate — the value restored by a top-off.
    pub hash_rate: u64,
    /// Hash rate currently counted in the pool (`hash_rate` decayed by halvings);
    /// kept in sync with `GlobalState.total_hash_rate`.
    pub effective_hash_rate: u64,
    /// Last time the miner topped off (resets the halving clock).
    pub last_topup_ts: i64,
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

impl Miner {
    /// Effective hash rate at `now`: full rate halved once per elapsed half-life
    /// since the last top-off (`base >> floor(elapsed / HALFLIFE)`).
    pub fn current_effective(&self, now_ts: i64) -> u64 {
        let elapsed = now_ts.saturating_sub(self.last_topup_ts);
        math::decayed_hash_rate(self.hash_rate, elapsed, crate::constants::HASHRATE_HALFLIFE_SECONDS)
    }

    /// Credit rewards accrued (at the current effective rate) into `accrued_base`
    /// and advance the `reward_debt` checkpoint. Call before any rate change.
    pub fn settle(&mut self, acc_reward_per_hash: u128) {
        let pending =
            math::pending_reward(acc_reward_per_hash, self.reward_debt, self.effective_hash_rate);
        self.accrued_base = self.accrued_base.saturating_add(pending);
        self.reward_debt = acc_reward_per_hash;
    }
}

/// Settle a miner against the pool, then re-apply hashrate decay: recompute the
/// miner's effective rate at `now` and adjust the pool total by the difference.
/// Used by claim and poke. Returns nothing; both accounts are mutated in place.
pub fn settle_and_decay(global: &mut GlobalState, miner: &mut Miner, now_ts: i64) -> Result<()> {
    global.update_pool(now_ts)?;
    miner.settle(global.acc_reward_per_hash);
    let new_eff = miner.current_effective(now_ts);
    if new_eff != miner.effective_hash_rate {
        global.total_hash_rate = global
            .total_hash_rate
            .checked_sub(miner.effective_hash_rate)
            .and_then(|t| t.checked_add(new_eff))
            .ok_or(KairoError::MathOverflow)?;
        miner.effective_hash_rate = new_eff;
    }
    Ok(())
}
