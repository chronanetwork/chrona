use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::ID as INSTRUCTIONS_SYSVAR_ID;
use anchor_lang::system_program::{self, Transfer};

use crate::constants::{GLOBAL_SEED, MINER_SEED};
use crate::ed25519::{attestation_message, verify_oracle_attestation};
use crate::errors::KairoError;
use crate::state::{GlobalState, Miner};

/// Register a wallet as a miner. Verifies a signed oracle attestation of the
/// wallet's score, charges the one-time initialization fee to the treasury,
/// and joins the mining pool at that score (= hash rate).
#[derive(Accounts)]
pub struct InitializeMiner<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_SEED], bump = global.bump, has_one = treasury)]
    pub global: Account<'info, GlobalState>,

    #[account(
        init,
        payer = owner,
        space = 8 + Miner::INIT_SPACE,
        seeds = [MINER_SEED, owner.key().as_ref()],
        bump
    )]
    pub miner: Account<'info, Miner>,

    /// Receives the initialization fee. Validated against `global.treasury`.
    #[account(mut)]
    pub treasury: SystemAccount<'info>,

    /// CHECK: Instructions sysvar, validated by address; read for ed25519 introspection.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeMiner>, score: u64, expiry: i64, nonce: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let owner_key = ctx.accounts.owner.key();

    {
        let g = &ctx.accounts.global;
        require!(!g.paused, KairoError::Paused);
        require!(g.active, KairoError::NotActive);
        require!(score >= g.min_score, KairoError::ScoreTooLow);
        require!(score <= g.max_score, KairoError::ScoreTooHigh);
        require!(now <= expiry, KairoError::AttestationExpired);

        // Verify the oracle signed this exact {wallet, score, expiry, nonce}.
        let msg = attestation_message(&owner_key, score, expiry, &nonce);
        verify_oracle_attestation(
            &ctx.accounts.instructions_sysvar.to_account_info(),
            &g.oracle_pubkey,
            &msg,
        )?;
    }

    // Charge the one-time initialization fee to the treasury.
    let fee = ctx.accounts.global.init_fee_lamports;
    let cpi = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.owner.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        },
    );
    system_program::transfer(cpi, fee)?;

    // Settle the pool to now, then join (settle BEFORE increasing total hash rate).
    let global = &mut ctx.accounts.global;
    global.update_pool(now)?;
    let acc = global.acc_reward_per_hash;
    global.total_hash_rate = global
        .total_hash_rate
        .checked_add(score)
        .ok_or(KairoError::MathOverflow)?;

    let miner = &mut ctx.accounts.miner;
    miner.owner = owner_key;
    miner.hash_rate = score;
    miner.effective_hash_rate = score; // full at join (just topped off)
    miner.last_topup_ts = now;
    miner.reward_debt = acc;
    miner.accrued_base = 0;
    miner.joined_ts = now;
    miner.attestation_expiry = expiry;
    miner.score_nonce = nonce;
    miner.bump = ctx.bumps.miner;

    msg!("kairo: miner {} joined at hash rate {}", owner_key, score);
    Ok(())
}
