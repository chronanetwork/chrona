use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;

use crate::constants::{GLOBAL_SEED, MINER_SEED};
use crate::ed25519::{attestation_message, verify_oracle_attestation};
use crate::errors::KairoError;
use crate::state::{GlobalState, Miner};

/// Voluntarily refresh a miner's score with a new signed attestation. Settles
/// rewards accrued at the old hash rate first, then swaps in the new one. Free
/// (no initialization fee).
#[derive(Accounts)]
pub struct ReAttest<'info> {
    pub owner: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump)]
    pub global: Account<'info, GlobalState>,

    #[account(
        mut,
        seeds = [MINER_SEED, owner.key().as_ref()],
        bump = miner.bump,
        has_one = owner
    )]
    pub miner: Account<'info, Miner>,

    /// CHECK: Instructions sysvar, validated by address.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ReAttest>, score: u64, expiry: i64, nonce: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let owner_key = ctx.accounts.owner.key();

    {
        let g = &ctx.accounts.global;
        require!(!g.paused, KairoError::Paused);
        require!(g.active, KairoError::NotActive);
        require!(score >= g.min_score, KairoError::ScoreTooLow);
        require!(score <= g.max_score, KairoError::ScoreTooHigh);
        require!(now <= expiry, KairoError::AttestationExpired);

        let msg = attestation_message(&owner_key, score, expiry, &nonce);
        verify_oracle_attestation(
            &ctx.accounts.instructions_sysvar.to_account_info(),
            &g.oracle_pubkey,
            &msg,
        )?;
    }

    let global = &mut ctx.accounts.global;
    global.update_pool(now)?;
    let acc = global.acc_reward_per_hash;

    let miner = &mut ctx.accounts.miner;
    let old = miner.hash_rate;
    miner.settle(acc); // credits rewards at the old hash rate, checkpoints reward_debt

    // total_hash_rate += new - old
    global.total_hash_rate = global
        .total_hash_rate
        .checked_sub(old)
        .ok_or(KairoError::MathOverflow)?
        .checked_add(score)
        .ok_or(KairoError::MathOverflow)?;

    miner.hash_rate = score;
    miner.attestation_expiry = expiry;
    miner.score_nonce = nonce;

    msg!("kairo: miner {} re-attested {} -> {}", owner_key, old, score);
    Ok(())
}
